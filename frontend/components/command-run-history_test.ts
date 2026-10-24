import type { CommandRunRecord, CommandRunSummary } from '../../api.ts'
import { CommandRunHistory } from './command-run-history.ts'
import { commandOutputLimit } from './command-output-buffer.ts'

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

const summary: CommandRunSummary = {
    id: 'run-id',
    commandId: 'command-id',
    title: 'Saved command name',
    startedAt: '2026-10-22T01:00:00.000Z',
    state: 'running',
}

function record(): CommandRunRecord {
    return {
        ...summary,
        command: {
            id: summary.commandId,
            name: summary.title,
            type: 'message',
            content: 'saved message',
        },
        results: [],
        processes: [{
            id: 'process-id',
            commandId: summary.commandId,
            title: 'Terminal child',
            state: 'running',
            stdout: 'before refresh\n',
            stderr: 'warning\n',
        }],
    }
}

Deno.test('frontend reloads backend history without starting commands', async () => {
    const snapshot = record()
    const backend = {
        getCommandRunHistory: () => Promise.resolve([{ ...summary }]),
        getCommandRun: () => Promise.resolve(structuredClone(snapshot)),
    }
    const firstPage = new CommandRunHistory(backend)
    await firstPage.refresh()
    const secondPage = new CommandRunHistory(backend)
    await secondPage.refresh()
    const run = secondPage.runs[0]
    await secondPage.refreshRun(run)
    assert(run.id === summary.id, 'backend supplies the execution identity')
    assert(run.title === summary.title, 'backend supplies the name snapshot')
    assert(
        run.startedAt.toISOString() === summary.startedAt,
        'time must survive reload',
    )
    assert(
        run.processes[0].stdout.text === 'before refresh\n',
        'output must survive reload',
    )
    assert(
        run.processes[0].stderr.text === 'warning\n',
        'stderr must survive reload',
    )
})

Deno.test('backend snapshots update existing views without duplicating output or processes', async () => {
    const snapshot = record()
    const history = new CommandRunHistory({
        getCommandRunHistory: () => Promise.resolve([{ ...summary }]),
        getCommandRun: () => Promise.resolve(structuredClone(snapshot)),
    })
    await history.refresh()
    const run = history.runs[0]
    await history.refreshRun(run)
    const process = run.processes[0]
    const stdout = process.stdout
    let updates = 0
    const unsubscribe = run.subscribe(() => updates++)
    snapshot.processes[0].stdout += 'after close\n'
    snapshot.processes[0].state = 'completed'
    snapshot.processes[0].result = {
        type: 'terminal',
        commandId: summary.commandId,
        title: 'Terminal child',
        code: 0,
        success: true,
        signal: null,
    }
    snapshot.state = 'completed'
    snapshot.finishedAt = '2026-10-22T01:01:00.000Z'
    snapshot.results = [{
        type: 'message',
        title: 'Result',
        content: 'saved result',
    }]
    await history.refreshRun(run)
    await history.refreshRun(run)
    unsubscribe()
    assert(run.processes.length === 1, 'polling must not duplicate processes')
    assert(
        run.processes[0] === process && process.stdout === stdout,
        'view references stay valid',
    )
    assert(
        stdout.text === 'before refresh\nafter close\n',
        'snapshots replace rather than append output',
    )
    assert(
        run.state === 'completed' && run.finishedAt !== undefined,
        'final state is from backend',
    )
    assert(
        run.results[0].type === 'message',
        'nonterminal results are restored',
    )
    assert(updates === 2, 'open views receive snapshot updates')
})

Deno.test('frontend truncates display only, without modifying persisted output', async () => {
    const snapshot = record()
    snapshot.processes[0].stdout = 'x'.repeat(commandOutputLimit + 20)
    const history = new CommandRunHistory({
        getCommandRunHistory: () => Promise.resolve([summary]),
        getCommandRun: () => Promise.resolve(structuredClone(snapshot)),
    })
    const run = history.accept(summary)
    await history.refreshRun(run)
    assert(run.processes[0].stdout.truncated, 'display must remain bounded')
    assert(
        run.processes[0].stdout.text.length === commandOutputLimit,
        'display limit stays 1 MiB',
    )
    assert(
        snapshot.processes[0].stdout.length > commandOutputLimit,
        'backend output remains complete',
    )
    snapshot.processes[0].stdout = 'short'
    await history.refreshRun(run)
    assert(
        !run.processes[0].stdout.truncated,
        'replacement resets truncation state',
    )
})

Deno.test('frontend history keeps concurrent and repeated child executions separate', async () => {
    const snapshot = record()
    snapshot.processes.push({
        ...snapshot.processes[0],
        id: 'second-process-id',
        stdout: 'second child',
    })
    const history = new CommandRunHistory({
        getCommandRunHistory: () =>
            Promise.resolve([
                {
                    ...summary,
                    id: 'second-run',
                    startedAt: '2026-10-22T01:02:00.000Z',
                },
                summary,
            ]),
        getCommandRun: () => Promise.resolve(snapshot),
    })
    await history.refresh()
    assert(history.runs[0].id === 'second-run', 'newest runs appear first')
    const run = history.runs[1]
    await history.refreshRun(run)
    assert(
        run.processes.length === 2,
        'repeated terminal children retain separate records',
    )
    assert(
        run.processes[1].stdout.text === 'second child',
        'child outputs remain separate',
    )
    await history.refresh()
    assert(
        history.runs.length === 2 && history.runs[1] === run,
        'refresh preserves run identity',
    )
})

Deno.test('frontend surfaces backend query failures', async () => {
    const history = new CommandRunHistory({
        getCommandRunHistory: () =>
            Promise.reject(new Error('database unavailable')),
        getCommandRun: () => Promise.reject(new Error('run not found')),
    })
    for (
        const action of [
            () => history.refresh(),
            () => history.refreshRun(history.accept(summary)),
        ]
    ) {
        let error: unknown
        try {
            await action()
        } catch (caught) {
            error = caught
        }
        assert(
            error instanceof Error,
            'query errors must not become empty history',
        )
    }
})
