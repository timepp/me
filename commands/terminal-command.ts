import type { TerminalCommandConfig } from '../command.ts'

export function runTerminalCommand(
    command: TerminalCommandConfig,
): Promise<void> {
    const fullCommand = [command.command, ...command.args].join(' ')
    new Deno.Command('cmd', {
        args: ['/c', 'start', 'cmd', '/k', fullCommand],
    }).spawn()
    return Promise.resolve()
}
