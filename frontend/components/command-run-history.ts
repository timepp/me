import { api } from '../../api.ts'
import type {
    BackendAPI,
    CommandRunRecord,
    CommandRunSummary,
} from '../../api.ts'
import type { CommandProcessRecord } from '../../command-history-types.ts'
import { CommandOutputBuffer } from './command-output-buffer.ts'

export type ProcessRun = Omit<CommandProcessRecord, 'stdout' | 'stderr'> & {
    stdout: CommandOutputBuffer
    stderr: CommandOutputBuffer
}

export class CommandRun {
    readonly id: string
    readonly commandId: string
    readonly title: string
    readonly startedAt: Date
    readonly processes: ProcessRun[] = []
    state: CommandRunSummary['state']
    finishedAt?: Date
    results: CommandRunRecord['results'] = []
    error?: string
    private listeners = new Set<() => void>()

    constructor(summary: CommandRunSummary) {
        this.id = summary.id
        this.commandId = summary.commandId
        this.title = summary.title
        this.startedAt = new Date(summary.startedAt)
        this.state = summary.state
        this.updateSummary(summary)
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    updateSummary(summary: CommandRunSummary): void {
        this.state = summary.state
        this.finishedAt = summary.finishedAt
            ? new Date(summary.finishedAt)
            : undefined
        this.error = summary.error
        this.notify()
    }

    update(record: CommandRunRecord): void {
        this.results = record.results
        for (const snapshot of record.processes) {
            let process = this.processes.find((item) => item.id === snapshot.id)
            if (!process) {
                process = {
                    ...snapshot,
                    stdout: new CommandOutputBuffer(),
                    stderr: new CommandOutputBuffer(),
                }
                this.processes.push(process)
            }
            process.state = snapshot.state
            process.result = snapshot.result
            process.error = snapshot.error
            process.stdout.replace(snapshot.stdout)
            process.stderr.replace(snapshot.stderr)
        }
        this.updateSummary(record)
    }

    private notify(): void {
        for (const listener of this.listeners) listener()
    }
}

type HistoryAPI = Pick<BackendAPI, 'getCommandRunHistory' | 'getCommandRun'>

export class CommandRunHistory {
    readonly runs: CommandRun[] = []
    private listeners = new Set<() => void>()

    constructor(private readonly backend: HistoryAPI = api) {}

    accept(summary: CommandRunSummary): CommandRun {
        let run = this.runs.find((item) => item.id === summary.id)
        if (run) {
            run.updateSummary(summary)
        } else {
            run = new CommandRun(summary)
            this.runs.push(run)
            this.runs.sort((a, b) =>
                b.startedAt.getTime() - a.startedAt.getTime()
            )
        }
        for (const listener of this.listeners) listener()
        return run
    }

    async refresh(): Promise<void> {
        const summaries = await this.backend.getCommandRunHistory()
        for (const summary of summaries) this.accept(summary)
    }

    async refreshRun(run: CommandRun): Promise<void> {
        run.update(await this.backend.getCommandRun(run.id))
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }
}
