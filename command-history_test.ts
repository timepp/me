import { CommandManager } from './command.ts'
import { CommandHistoryStore } from './command-history.ts'
import type { CommandConfig } from './command.ts'
import type { CommandRunSummary } from './command-history-types.ts'

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

const commandId = '11111111-1111-4111-8111-111111111111'
const compoundId = '22222222-2222-4222-8222-222222222222'
const messageId = '33333333-3333-4333-8333-333333333333'

function terminal(script: string): CommandConfig {
    return {
        id: commandId,
        name: 'Terminal',
        type: 'terminal',
        command: Deno.execPath(),
        args: ['eval', script],
    }
}

async function fixture(commands: CommandConfig[]) {
    const directory = await Deno.makeTempDir()
    const config = `${directory}\\commands.json`
    await Deno.writeTextFile(config, JSON.stringify(commands))
    const manager = new CommandManager(config)
    return {
        config,
        manager,
        async cleanup() {
            manager.close()
            await Deno.remove(directory, { recursive: true })
        },
    }
}

Deno.test('returned commands include persisted run counts and last start times', async () => {
    const setup = await fixture([
        terminal('Deno.exit(7)'),
        {
            id: messageId,
            type: 'message',
            name: 'Message',
            content: 'result',
        },
    ])
    try {
        const initial = await setup.manager.getCommands()
        assert(
            initial.every((command) =>
                command.runcount === 0 && command.lastrun === null
            ),
            'every never-run command must have count 0 and last run null',
        )
        await Promise.all([
            setup.manager.runCommand(
                messageId,
                () => Promise.resolve(undefined),
            ),
            setup.manager.runCommand(
                messageId,
                () => Promise.resolve(undefined),
            ),
        ])
        let failure: unknown
        let observedRunning = false
        try {
            await setup.manager.runCommand(
                commandId,
                () => Promise.resolve(undefined),
                undefined,
                async (summary) => {
                    const commands = await setup.manager.getCommands()
                    const command = commands.find((item) =>
                        item.id === commandId
                    )
                    assert(
                        command?.runcount === 1 &&
                            command.lastrun === summary.startedAt,
                        'running commands must already count toward statistics',
                    )
                    observedRunning = true
                },
            )
        } catch (error) {
            failure = error
        }
        assert(failure instanceof Error, 'terminal must fail')
        assert(observedRunning, 'test must verify statistics before completion')
        setup.manager.close()
        const reloaded = new CommandManager(setup.config)
        try {
            const commands = await reloaded.getCommands()
            const message = commands.find((command) => command.id === messageId)
            const failed = commands.find((command) => command.id === commandId)
            assert(
                message?.runcount === 2,
                'concurrent runs must both count after reload',
            )
            assert(
                message.lastrun ===
                    reloaded.getCommandRunHistory(messageId)[0].startedAt,
                'last run must be the most recent start timestamp',
            )
            assert(
                failed?.runcount === 1 && failed.lastrun !== null,
                'failed runs must count',
            )
            const updated = await reloaded.updateCommand(messageId, {
                type: 'message',
                name: 'Renamed',
                content: 'edited',
            })
            assert(
                updated.runcount === 2 && updated.lastrun === message.lastrun,
                'update responses must include statistics preserved across edits',
            )
            const added = await reloaded.addCommand({
                type: 'message',
                name: 'New',
                content: 'new',
            })
            assert(
                added.runcount === 0 && added.lastrun === null,
                'add responses must include zero statistics',
            )
            const configs: Record<string, unknown>[] = JSON.parse(
                await Deno.readTextFile(setup.config),
            )
            assert(
                configs.every((command) =>
                    !Object.hasOwn(command, 'runcount') &&
                    !Object.hasOwn(command, 'lastrun')
                ),
                'derived statistics must not be written into command configuration',
            )
        } finally {
            reloaded.close()
        }
    } finally {
        await setup.cleanup()
    }
})

Deno.test('backend persists timestamps, results and full output across manager reloads', async () => {
    const setup = await fixture([terminal(
        'console.log("x".repeat(1024 * 1024 + 64)); console.error("warning")',
    )])
    try {
        let started: CommandRunSummary | undefined
        const results = await setup.manager.runCommand(
            commandId,
            () => Promise.resolve(undefined),
            undefined,
            (run) => {
                started = run
                assert(
                    setup.manager.getCommandRun(run.id).state === 'running',
                    'run must be durable before notifying the frontend',
                )
                return Promise.resolve()
            },
        )
        assert(started !== undefined, 'backend must supply the run ID')
        setup.manager.close()
        const reloaded = new CommandManager(setup.config)
        try {
            const summaries = reloaded.getCommandRunHistory(commandId)
            assert(
                summaries.length === 1,
                'run must survive reopening the database',
            )
            const run = reloaded.getCommandRun(started.id)
            assert(run.state === 'completed', 'final state must persist')
            assert(
                run.startedAt === started.startedAt &&
                    run.finishedAt !== undefined,
                'both timestamps must persist',
            )
            assert(
                Date.parse(run.finishedAt) >= Date.parse(run.startedAt),
                'finish must follow start',
            )
            assert(
                JSON.stringify(run.results) === JSON.stringify(results),
                'results must persist',
            )
            assert(
                run.processes[0].stdout.length > 1024 * 1024,
                'backend must not truncate output',
            )
            assert(
                run.processes[0].stderr.includes('warning'),
                'stderr must persist',
            )
            assert(
                run.processes[0].result?.code === 0,
                'exit status must persist',
            )
            await reloaded.deleteCommand(commandId)
            assert(
                reloaded.getCommandRun(started.id).command.name === 'Terminal',
                'history must survive command deletion',
            )
        } finally {
            reloaded.close()
        }
    } finally {
        await setup.cleanup()
    }
})

Deno.test('backend retains partial output, nonzero exit and earlier compound results on failure', async () => {
    const setup = await fixture([
        terminal(
            'console.log("partial"); console.error("error output"); Deno.exit(7)',
        ),
        {
            id: messageId,
            type: 'message',
            name: 'Message',
            content: 'earlier result',
        },
        {
            id: compoundId,
            type: 'compound',
            name: 'Compound',
            mode: 'all',
            subCommandIds: [messageId, commandId],
        },
    ])
    try {
        let error: unknown
        try {
            await setup.manager.runCommand(
                compoundId,
                () => Promise.resolve(undefined),
            )
        } catch (caught) {
            error = caught
        }
        assert(
            error instanceof Error && error.message.includes('code 7'),
            'execution still rejects',
        )
        const [summary] = setup.manager.getCommandRunHistory()
        const run = setup.manager.getCommandRun(summary.id)
        assert(
            run.state === 'failed' && run.error?.includes('code 7'),
            'failure must persist',
        )
        assert(
            run.results[0]?.type === 'message',
            'completed child results must survive later failure',
        )
        assert(run.processes[0].result?.code === 7, 'nonzero exit must persist')
        assert(
            run.processes[0].stdout.includes('partial'),
            'partial stdout must persist',
        )
        assert(
            run.processes[0].stderr.includes('error output'),
            'stderr must persist',
        )
    } finally {
        await setup.cleanup()
    }
})

Deno.test('backend isolates concurrent runs and repeated terminal children', async () => {
    const nestedId = '44444444-4444-4444-8444-444444444444'
    const setup = await fixture([
        terminal('console.log("child")'),
        {
            id: nestedId,
            name: 'Nested',
            type: 'compound',
            mode: 'all',
            subCommandIds: [commandId],
        },
        {
            id: compoundId,
            name: 'Compound',
            type: 'compound',
            mode: 'all',
            subCommandIds: [commandId, nestedId],
        },
    ])
    try {
        await Promise.all([
            setup.manager.runCommand(
                compoundId,
                () => Promise.resolve(undefined),
            ),
            setup.manager.runCommand(
                commandId,
                () => Promise.resolve(undefined),
            ),
        ])
        const summaries = setup.manager.getCommandRunHistory()
        assert(
            summaries.length === 2 && summaries[0].id !== summaries[1].id,
            'concurrent runs have separate IDs',
        )
        const [compound] = setup.manager.getCommandRunHistory(compoundId)
        const run = setup.manager.getCommandRun(compound.id)
        assert(
            run.processes.length === 2,
            'repeated child executions must remain separate',
        )
        assert(
            run.processes[0].id !== run.processes[1].id,
            'child process IDs must be unique',
        )
        assert(
            run.processes.every((process) => process.stdout.includes('child')),
            'each child output must persist',
        )
    } finally {
        await setup.cleanup()
    }
})

Deno.test('disconnected output clients do not stop backend execution or recording', async () => {
    const setup = await fixture([terminal('console.log("still recorded")')])
    try {
        await setup.manager.runCommand(
            commandId,
            () => Promise.resolve(undefined),
            () => Promise.reject(new Error('client disconnected')),
        )
        const [summary] = setup.manager.getCommandRunHistory()
        const run = setup.manager.getCommandRun(summary.id)
        assert(
            run.state === 'completed',
            'client callback failure must not kill the command',
        )
        assert(
            run.processes[0].stdout.includes('still recorded'),
            'output must still be persisted',
        )
    } finally {
        await setup.cleanup()
    }
})

Deno.test('backend persists live output before notifying clients', async () => {
    const setup = await fixture([terminal('console.log("live output")')])
    const reader = new CommandManager(setup.config)
    try {
        let id = ''
        let observed = false
        await setup.manager.runCommand(
            commandId,
            () => Promise.resolve(undefined),
            (event) => {
                if (event.type === 'stdout') {
                    const run = reader.getCommandRun(id)
                    assert(
                        run.state === 'running',
                        'output must be queryable before completion',
                    )
                    assert(
                        run.processes[0].stdout.includes(event.data),
                        'output must be durable before delivery',
                    )
                    observed = true
                }
                return Promise.resolve()
            },
            (run) => {
                id = run.id
                return Promise.resolve()
            },
        )
        assert(observed, 'test must observe live output')
    } finally {
        reader.close()
        await setup.cleanup()
    }
})

Deno.test('querying history does not interrupt another live backend process', async () => {
    const directory = await Deno.makeTempDir()
    const path = `${directory}\\history.sqlite`
    const store = new CommandHistoryStore(path)
    const moduleUrl = new URL('./command-history.ts', import.meta.url).href
    const child = new Deno.Command(Deno.execPath(), {
        args: [
            'eval',
            `
            import { CommandHistoryStore } from ${JSON.stringify(moduleUrl)};
            const store = new CommandHistoryStore(${JSON.stringify(path)});
            const run = store.start(${JSON.stringify(terminal(''))});
            console.log(run.id);
            await Deno.stdin.read(new Uint8Array(1));
            store.complete(run.id, []);
            store.close();
        `,
        ],
        stdin: 'piped',
        stdout: 'piped',
        stderr: 'piped',
    }).spawn()
    try {
        const output = child.stdout.getReader()
        try {
            const ready = await output.read()
            assert(
                ready.value?.length,
                'child must create a run before querying',
            )
        } finally {
            output.releaseLock()
        }
        const [summary] = store.list()
        assert(
            summary.state === 'running',
            'a live process must not be marked interrupted',
        )
        assert(
            store.get(summary.id).state === 'running',
            'details must also remain running',
        )
    } finally {
        await child.stdin.close()
        const result = await child.output()
        store.close()
        await Deno.remove(directory, { recursive: true })
        assert(result.success, new TextDecoder().decode(result.stderr))
    }
})

Deno.test('missing executables produce persisted failed runs', async () => {
    const setup = await fixture([{
        id: commandId,
        name: 'Missing executable',
        type: 'terminal',
        command: 'missing-command-history-test-executable.exe',
        args: [],
    }])
    try {
        let error: unknown
        try {
            await setup.manager.runCommand(
                commandId,
                () => Promise.resolve(undefined),
            )
        } catch (caught) {
            error = caught
        }
        assert(error instanceof Error, 'startup failure must reject')
        const [summary] = setup.manager.getCommandRunHistory()
        const run = setup.manager.getCommandRun(summary.id)
        assert(
            run.state === 'failed' && run.error === error.message,
            'startup error must persist',
        )
        assert(
            run.processes[0].state === 'failed',
            'failed process must be recorded',
        )
    } finally {
        await setup.cleanup()
    }
})

Deno.test('backend restart marks abandoned runs failed and retains captured output', async () => {
    const directory = await Deno.makeTempDir()
    const path = `${directory}\\history.sqlite`
    const store = new CommandHistoryStore(path)
    try {
        const moduleUrl = new URL('./command-history.ts', import.meta.url).href
        const script = `
            import { CommandHistoryStore } from ${JSON.stringify(moduleUrl)};
            const store = new CommandHistoryStore(${JSON.stringify(path)});
            const run = store.start(${JSON.stringify(terminal(''))});
            store.appendEvent(run.id, {type: 'started', commandId: ${
            JSON.stringify(commandId)
        }, title: 'Terminal'});
            store.appendEvent(run.id, {type: 'stdout', commandId: ${
            JSON.stringify(commandId)
        }, data: 'before shutdown'});
            store.close();
        `
        const child = await new Deno.Command(Deno.execPath(), {
            args: ['eval', script],
            stdout: 'piped',
            stderr: 'piped',
        }).output()
        assert(child.success, new TextDecoder().decode(child.stderr))
        const [summary] = store.list()
        assert(
            summary.state === 'failed' &&
                summary.error?.includes('interrupted'),
            'abandoned run must not remain running',
        )
        const run = store.get(summary.id)
        assert(
            run.processes[0].stdout === 'before shutdown',
            'interruption must preserve output',
        )
        assert(
            run.processes[0].state === 'failed',
            'unfinished processes must be marked failed',
        )
    } finally {
        store.close()
        await Deno.remove(directory, { recursive: true })
    }
})
