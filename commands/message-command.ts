import type { MessageCommandConfig } from '../command.ts'
import type { MessageCommandResult } from './types.ts'

export function runMessageCommand(
    command: MessageCommandConfig,
): MessageCommandResult {
    return {
        type: 'message',
        title: command.name,
        description: command.description,
        content: command.content,
    }
}
