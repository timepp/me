import type { CommandConfig } from '../command.ts'
import { runCodeCommand } from './code-command.ts'
import { runCompoundCommand } from './compound-command.ts'
import { runMessageCommand } from './message-command.ts'
import { runOneAuthCommand } from './one-auth-command.ts'
import { runTerminalCommand } from './terminal-command.ts'
import type {
    CommandExecutionContext,
    CommandExecutionResult,
} from './types.ts'
import { runUrlCommand } from './url-command.ts'

export async function executeCommand(
    command: CommandConfig,
    context: CommandExecutionContext,
): Promise<CommandExecutionResult[]> {
    switch (command.type) {
        case 'url':
            await runUrlCommand(command)
            return []
        case 'terminal':
            await runTerminalCommand(command)
            return []
        case 'code':
            await runCodeCommand(command)
            return []
        case 'message':
            return [runMessageCommand(command)]
        case 'oneAuth':
            return [await runOneAuthCommand(command)]
        case 'compound':
            return await runCompoundCommand(command, context)
    }
}
