import type { CommandConfig } from '../command.ts'
import type { OneAuthInfo } from '../lib/oneauth.ts'
import type { CommandStatus } from './status.ts'

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

export type StatusCommandResult = {
    type: 'status'
    commandId: string
    title: string
    status: CommandStatus
}

export type CommandExecutionResult =
    | MessageCommandResult
    | OneAuthCommandResult
    | StatusCommandResult

export type CommandExecutionContext = {
    getUserInput: GetUserInput
    runCommandById: (id: string) => Promise<CommandExecutionResult[]>
    commandsById: ReadonlyMap<string, CommandConfig>
}
