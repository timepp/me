import { CommandManager, type TerminalCommandConfig } from '../command.ts'
import type { CommandEvent, OnCommandEvent } from './types.ts'
import { runTerminalCommand } from './terminal-command.ts'

const command: TerminalCommandConfig = {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'terminal',
    name: 'Terminal output',
    command: Deno.execPath(),
    args: [],
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

async function assertRejects(
    action: () => Promise<unknown>,
    expectedMessage: string,
): Promise<void> {
    let error: unknown
    try {
        await action()
    } catch (caught) {
        error = caught
    }
    assert(error instanceof Error, 'operation should reject')
    assert(
        error.message.includes(expectedMessage),
        `error should include "${expectedMessage}", got "${error.message}"`,
    )
}

function captureEvents() {
    const events: CommandEvent[] = []
    const onCommandEvent: OnCommandEvent = (event) => {
        events.push(event)
        return Promise.resolve()
    }
    const output = (type: 'stdout' | 'stderr') =>
        events.flatMap((event) => event.type === type ? [event.data] : []).join(
            '',
        )
    return { events, onCommandEvent, output }
}

Deno.test('terminal commands stream separate outputs and preserve argument boundaries', async () => {
    const args = ['two words', 'a&b|c>d', '"quoted"', '', '\u4e2d\u6587']
    const capture = captureEvents()
    const result = await runTerminalCommand({
        ...command,
        args: [
            'eval',
            'console.log(JSON.stringify(Deno.args)); console.error("diagnostic");',
            ...args,
        ],
    }, capture.onCommandEvent)
    assert(
        result.type === 'terminal',
        'result should describe process completion',
    )
    assert(result.title === command.name, 'result should retain the name')
    assert(result.success && result.code === 0, 'process should succeed')
    assert(
        capture.output('stdout') === `${JSON.stringify(args)}\n`,
        'stdout should be exact without shell interpretation',
    )
    assert(
        capture.output('stderr') === 'diagnostic\n',
        'stderr must be separate',
    )
    assert(
        capture.events[0].type === 'started',
        'start must be delivered first',
    )
    assert(
        capture.events.at(-1)?.type === 'completed',
        'completion must follow all output callbacks',
    )
    assert(!('content' in result), 'result must not accumulate process output')
})

Deno.test('terminal commands deliver output while the child is still running', async () => {
    const directory = await Deno.makeTempDir()
    const marker = `${directory}\\received`
    const capture = captureEvents()
    try {
        await runTerminalCommand({
            ...command,
            args: [
                'eval',
                `console.log("live stdout"); console.error("live stderr");
                const deadline = Date.now() + 5000;
                while (true) {
                    try { await Deno.stat(Deno.args[0]); break; }
                    catch (error) { if (!(error instanceof Deno.errors.NotFound)) throw error; }
                    if (Date.now() > deadline) Deno.exit(9);
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                console.log("after callback");`,
                marker,
            ],
        }, async (event) => {
            await capture.onCommandEvent(event)
            if (
                event.type === 'stdout' || event.type === 'stderr'
            ) {
                if (
                    capture.output('stdout').includes('live stdout') &&
                    capture.output('stderr').includes('live stderr')
                ) {
                    await Deno.writeTextFile(marker, 'received')
                }
            }
        })
        assert(
            capture.output('stdout').includes('after callback'),
            'child must receive callback acknowledgement before it can finish',
        )
    } finally {
        await Deno.remove(directory, { recursive: true })
    }
})

Deno.test('terminal commands decode UTF-8 split across chunks and flush final text', async () => {
    const capture = captureEvents()
    await runTerminalCommand({
        ...command,
        args: [
            'eval',
            `const bytes = new TextEncoder().encode("\\u4e2d\\u6587\\nlast");
            await Deno.stdout.write(bytes.subarray(0, 2));
            await new Promise(resolve => setTimeout(resolve, 30));
            await Deno.stdout.write(bytes.subarray(2));
            await Deno.stderr.write(new Uint8Array([0xe4]));`,
        ],
    }, capture.onCommandEvent)
    assert(
        capture.output('stdout') === '\u4e2d\u6587\nlast',
        'UTF-8 must stay intact',
    )
    assert(
        capture.output('stderr') === '\ufffd',
        'decoder must flush pending bytes',
    )
})

Deno.test('terminal commands drain both pipes concurrently with async callbacks', async () => {
    let stdout = 0
    let stderr = 0
    await runTerminalCommand({
        ...command,
        args: [
            'eval',
            `const bytes = new Uint8Array(256 * 1024).fill(120);
            for (const stream of [Deno.stdout, Deno.stderr]) {
                let offset = 0;
                while (offset < bytes.length) offset += await stream.write(bytes.subarray(offset));
            }`,
        ],
    }, async (event) => {
        if (event.type === 'stdout') stdout += event.data.length
        if (event.type === 'stderr') stderr += event.data.length
        await new Promise((resolve) => setTimeout(resolve, 1))
    })
    assert(stdout === 256 * 1024, 'all stdout must be delivered')
    assert(stderr === 256 * 1024, 'all stderr must be delivered')
})

Deno.test('terminal commands complete with empty output and no callback', async () => {
    const result = await runTerminalCommand({ ...command, args: ['eval', ''] })
    assert(
        result.success && result.code === 0,
        'empty output should still succeed',
    )
})

Deno.test('terminal commands report nonzero completion after delivering partial outputs', async () => {
    const capture = captureEvents()
    await assertRejects(
        () =>
            runTerminalCommand({
                ...command,
                args: [
                    'eval',
                    'console.log("partial output"); console.error("failure detail"); Deno.exit(7);',
                ],
            }, capture.onCommandEvent),
        'code 7',
    )
    assert(
        capture.output('stdout') === 'partial output\n',
        'partial stdout must arrive',
    )
    assert(
        capture.output('stderr') === 'failure detail\n',
        'stderr must arrive',
    )
    const last = capture.events.at(-1)
    assert(
        last?.type === 'completed' && !last.result.success &&
            last.result.code === 7,
        'nonzero completion must be delivered before the API rejects',
    )
})

Deno.test('terminal commands report executable startup failures through callbacks', async () => {
    const directory = await Deno.makeTempDir()
    const capture = captureEvents()
    try {
        await assertRejects(
            () =>
                runTerminalCommand({
                    ...command,
                    command: `${directory}\\missing-executable.exe`,
                }, capture.onCommandEvent),
            'missing-executable.exe',
        )
        assert(
            capture.events[0].type === 'started',
            'panel should exist before spawn',
        )
        assert(
            capture.events.at(-1)?.type === 'failed',
            'startup failure must be delivered',
        )
    } finally {
        await Deno.remove(directory)
    }
})

Deno.test('terminal commands terminate and drain the child when a callback fails', async () => {
    await assertRejects(
        () =>
            runTerminalCommand({
                ...command,
                args: [
                    'eval',
                    'console.log("ready"); setInterval(() => console.error("still running"), 50);',
                ],
            }, (event) => {
                if (event.type === 'stdout') {
                    return Promise.reject(new Error('callback disconnected'))
                }
                return Promise.resolve()
            }),
        'callback disconnected',
    )
})

Deno.test('CommandManager forwards terminal events through nested compound commands', async () => {
    const directory = await Deno.makeTempDir()
    const path = `${directory}\\commands.json`
    const capture = captureEvents()
    const compoundId = '22222222-2222-4222-8222-222222222222'
    const parentId = '33333333-3333-4333-8333-333333333333'
    const manager = new CommandManager(path)
    try {
        await Deno.writeTextFile(
            path,
            JSON.stringify([
                {
                    ...command,
                    args: ['eval', 'console.log("first\\nsecond");'],
                },
                {
                    id: compoundId,
                    type: 'compound',
                    name: 'Nested',
                    mode: 'all',
                    subCommandIds: [command.id],
                },
                {
                    id: parentId,
                    type: 'compound',
                    name: 'Parent',
                    mode: 'all',
                    subCommandIds: [compoundId],
                },
            ]),
        )
        const results = await manager.runCommand(
            parentId,
            () => Promise.resolve(undefined),
            capture.onCommandEvent,
        )
        assert(
            results.length === 1,
            'terminal should return one completion result',
        )
        assert(
            results[0].type === 'terminal',
            'API result should describe completion',
        )
        assert(
            capture.output('stdout') === 'first\nsecond\n',
            'API must forward stdout',
        )
        assert(
            capture.events.every((event) => event.commandId === command.id),
            'events must identify the terminal child',
        )
    } finally {
        manager.close()
        await Deno.remove(directory, { recursive: true })
    }
})
