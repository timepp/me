import type { TerminalCommandConfig } from '../command.ts'
import type { OnCommandEvent, TerminalCommandResult } from './types.ts'

export async function runTerminalCommand(
    command: TerminalCommandConfig,
    onCommandEvent?: OnCommandEvent,
): Promise<TerminalCommandResult> {
    const fullCommand = [command.command, ...command.args].join(' ')
    console.log(`executing: ${fullCommand}`)
    await onCommandEvent?.({
        type: 'started',
        commandId: command.id,
        title: command.name,
    })

    let status: Deno.CommandStatus
    try {
        status = await streamProcess(command, onCommandEvent)
    } catch (error) {
        await onCommandEvent?.({
            type: 'failed',
            commandId: command.id,
            error: error instanceof Error ? error.message : String(error),
        })
        throw error
    }
    const result: TerminalCommandResult = {
        type: 'terminal',
        commandId: command.id,
        title: command.name,
        success: status.success,
        code: status.code,
        signal: status.signal,
    }
    await onCommandEvent?.({
        type: 'completed',
        commandId: command.id,
        result,
    })
    if (!status.success) {
        throw new Error(
            `Command "${command.name}" exited with code ${status.code}.${
                status.signal ? ` Signal: ${status.signal}.` : ''
            }`,
        )
    }
    return result
}

async function streamProcess(
    command: TerminalCommandConfig,
    onCommandEvent?: OnCommandEvent,
): Promise<Deno.CommandStatus> {
    const child = new Deno.Command(command.command, {
        args: command.args,
        stdin: 'null',
        stdout: 'piped',
        stderr: 'piped',
    }).spawn()
    const abort = new AbortController()
    const forward = async (
        stream: ReadableStream<Uint8Array>,
        type: 'stdout' | 'stderr',
    ) => {
        const decoder = new TextDecoder()
        const send = async (data: string) => {
            if (data) {
                await onCommandEvent?.({ type, commandId: command.id, data })
            }
        }
        await stream.pipeTo(
            new WritableStream<Uint8Array>({
                write: (chunk) => send(decoder.decode(chunk, { stream: true })),
                close: () => send(decoder.decode()),
            }),
            { signal: abort.signal },
        )
    }
    const tasks = [
        forward(child.stdout, 'stdout'),
        forward(child.stderr, 'stderr'),
        child.status,
    ] as const
    try {
        const [, , status] = await Promise.all(tasks)
        return status
    } catch (error) {
        abort.abort(error)
        try {
            child.kill()
        } catch (killError) {
            if (!(killError instanceof Deno.errors.NotFound)) {
                throw new AggregateError(
                    [error, killError],
                    'Failed to stream output and terminate the command',
                )
            }
        } finally {
            await Promise.allSettled(tasks)
        }
        throw error
    }
}
