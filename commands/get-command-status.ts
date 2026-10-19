import type { CommandConfig } from '../command.ts'
import {
    type CommandStatus,
    satisfied,
    statusError,
    unknown,
    unsatisfied,
} from './status.ts'
import { getWindowsCommandStatus } from './windows-command.ts'

export async function getCommandStatus(
    command: CommandConfig,
): Promise<CommandStatus> {
    try {
        switch (command.type) {
            case 'terminal':
                return command.statusPort === undefined
                    ? unknown('No status check configured')
                    : await getPortStatus(command.statusPort)
            case 'registry':
            case 'pathEntry':
            case 'scheduledTask':
            case 'shortcut':
            case 'junction':
            case 'fileContent':
            case 'powerShell':
                return await getWindowsCommandStatus(command)
            default:
                return unknown('This command does not provide status')
        }
    } catch (error) {
        return statusError(error)
    }
}

async function getPortStatus(port: number): Promise<CommandStatus> {
    try {
        const connection = await Deno.connect({
            hostname: '127.0.0.1',
            port,
        })
        connection.close()
        return satisfied(`Port ${port} is open`)
    } catch (error) {
        if (error instanceof Deno.errors.ConnectionRefused) {
            return unsatisfied(`Port ${port} is closed`)
        }
        throw error
    }
}
