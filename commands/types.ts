import type { CommandConfig } from '../command.ts'
import type { OneAuthInfo } from '../lib/oneauth.ts'

export type GetUserInput = (
    topic: string,
    choices?: string[],
    allowFreeString?: boolean,
) => Promise<string | undefined>

export type MessageCommandResult = {
    type: 'message'
    title: string
    description?: string
    content: string
}

export type OneAuthCommandResult = {
    type: 'oneAuth'
    title: string
    accounts: OneAuthInfo[]
}

export type CommandExecutionResult =
    | MessageCommandResult
    | OneAuthCommandResult

export type CommandExecutionContext = {
    getUserInput: GetUserInput
    runCommandById: (id: string) => Promise<CommandExecutionResult[]>
    commandsById: ReadonlyMap<string, CommandConfig>
}
