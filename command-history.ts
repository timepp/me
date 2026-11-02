import { DatabaseSync } from 'node:sqlite'
import { kill } from 'node:process'
import type { CommandConfig } from './command.ts'
import type {
    CommandProcessRecord,
    CommandRunRecord,
    CommandRunStats,
    CommandRunSummary,
} from './command-history-types.ts'
import type { CommandEvent, CommandExecutionResult } from './commands/types.ts'

const sessionId = crypto.randomUUID()
const activeRuns = new Set<string>()

function isProcessRunning(pid: number): boolean {
    try {
        kill(pid, 0)
        return true
    } catch (error) {
        if (
            error instanceof Error && 'code' in error && error.code === 'EPERM'
        ) {
            return true
        }
        if (
            error instanceof Error && 'code' in error && error.code === 'ESRCH'
        ) {
            return false
        }
        throw error
    }
}

export class CommandHistoryStore {
    private database?: DatabaseSync

    constructor(private readonly path: string | URL) {}

    private get db(): DatabaseSync {
        if (!this.database) {
            const db = new DatabaseSync(this.path)
            db.exec(`
                PRAGMA busy_timeout = 5000;
                PRAGMA journal_mode = WAL;
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
                    command_id TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    state TEXT NOT NULL,
                    pid INTEGER NOT NULL,
                    session_id TEXT NOT NULL,
                    record TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS runs_command_time
                    ON runs(command_id, started_at DESC);
                CREATE TABLE IF NOT EXISTS events (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    event TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS events_run ON events(run_id, sequence);
            `)
            this.database = db
        }
        return this.database
    }

    start(command: CommandConfig): CommandRunSummary {
        const record: CommandRunRecord = {
            id: crypto.randomUUID(),
            commandId: command.id,
            title: command.name,
            command: structuredClone(command),
            startedAt: new Date().toISOString(),
            state: 'running',
            results: [],
            processes: [],
        }
        this.db.prepare(
            'INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(
            record.id,
            record.commandId,
            record.startedAt,
            record.state,
            Deno.pid,
            sessionId,
            JSON.stringify(record),
        )
        activeRuns.add(record.id)
        return this.summary(record)
    }

    appendEvent(id: string, event: CommandEvent): void {
        this.db.prepare('INSERT INTO events(run_id, event) VALUES (?, ?)')
            .run(id, JSON.stringify(event))
    }

    complete(id: string, results: CommandExecutionResult[]): void {
        const record = this.readRecord(id)
        record.results = structuredClone(results)
        this.finish(record, 'completed')
    }

    appendResults(id: string, results: CommandExecutionResult[]): void {
        const record = this.readRecord(id)
        record.results.push(...structuredClone(results))
        this.db.prepare('UPDATE runs SET record = ? WHERE id = ?')
            .run(JSON.stringify(record), id)
    }

    fail(id: string, error: unknown): void {
        const record = this.readRecord(id)
        record.error = error instanceof Error ? error.message : String(error)
        this.finish(record, 'failed')
    }

    getRunStats(): Map<string, CommandRunStats> {
        const rows = this.db.prepare(`
            SELECT command_id, COUNT(*) AS runcount, MAX(started_at) AS lastrun
            FROM runs GROUP BY command_id
        `).all()
        return new Map(rows.map((row) => [
            String(row.command_id),
            { runcount: Number(row.runcount), lastrun: String(row.lastrun) },
        ]))
    }

    list(commandId?: string): CommandRunSummary[] {
        this.recoverInterruptedRuns()
        const rows = commandId === undefined
            ? this.db.prepare(
                'SELECT record FROM runs ORDER BY started_at DESC, rowid DESC',
            ).all()
            : this.db.prepare(
                'SELECT record FROM runs WHERE command_id = ? ORDER BY started_at DESC, rowid DESC',
            ).all(commandId)
        return rows.map((row) =>
            this.summary(JSON.parse(String(row.record)) as CommandRunRecord)
        )
    }

    get(id: string): CommandRunRecord {
        this.recoverInterruptedRuns()
        const record = this.readRecord(id)
        const currentProcesses = new Map<string, CommandProcessRecord>()
        const events = this.db.prepare(
            'SELECT sequence, event FROM events WHERE run_id = ? ORDER BY sequence',
        ).all(id)
        for (const row of events) {
            const event = JSON.parse(String(row.event)) as CommandEvent
            if (event.type === 'started') {
                const process: CommandProcessRecord = {
                    id: `${id}:${row.sequence}`,
                    commandId: event.commandId,
                    title: event.title,
                    state: 'running',
                    stdout: '',
                    stderr: '',
                }
                record.processes.push(process)
                currentProcesses.set(event.commandId, process)
                continue
            }
            const process = currentProcesses.get(event.commandId)
            if (!process) {
                throw new Error(`History event has no process: ${id}`)
            }
            switch (event.type) {
                case 'stdout':
                case 'stderr':
                    process[event.type] += event.data
                    break
                case 'completed':
                    process.result = event.result
                    process.state = event.result.success
                        ? 'completed'
                        : 'failed'
                    break
                case 'failed':
                    process.error = event.error
                    process.state = 'failed'
                    break
            }
        }
        if (record.state === 'failed') {
            for (const process of record.processes) {
                if (process.state === 'running') {
                    process.state = 'failed'
                    process.error = record.error
                }
            }
        }
        return record
    }

    close(): void {
        this.database?.close()
        this.database = undefined
    }

    private readRecord(id: string): CommandRunRecord {
        const row = this.db.prepare('SELECT record FROM runs WHERE id = ?').get(
            id,
        )
        if (!row) throw new Error(`Command run not found: ${id}`)
        return JSON.parse(String(row.record)) as CommandRunRecord
    }

    private summary(record: CommandRunRecord): CommandRunSummary {
        const { id, commandId, title, state, startedAt, finishedAt, error } =
            record
        return { id, commandId, title, state, startedAt, finishedAt, error }
    }

    private finish(
        record: CommandRunRecord,
        state: 'completed' | 'failed',
    ): void {
        record.state = state
        record.finishedAt = new Date().toISOString()
        this.db.prepare('UPDATE runs SET state = ?, record = ? WHERE id = ?')
            .run(state, JSON.stringify(record), record.id)
        activeRuns.delete(record.id)
    }

    private recoverInterruptedRuns(): void {
        for (
            const row of this.db.prepare(
                "SELECT id, pid, session_id FROM runs WHERE state = 'running'",
            ).all()
        ) {
            const id = String(row.id)
            const active = row.session_id === sessionId
                ? activeRuns.has(id)
                : isProcessRunning(Number(row.pid))
            if (!active) {
                this.fail(
                    id,
                    new Error(
                        'Command execution interrupted by backend shutdown',
                    ),
                )
            }
        }
    }
}
