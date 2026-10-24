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

export type TerminalCommandResult = {
    type: 'terminal'
    commandId: string
    title: string
    success: boolean
    code: number
    signal: string | null
}

export type CommandEvent =
    | {
        type: 'started'
        commandId: string
        title: string
    }
    | {
        type: 'stdout' | 'stderr'
        commandId: string
        data: string
    }
    | {
        type: 'completed'
        commandId: string
        result: TerminalCommandResult
    }
    | {
        type: 'failed'
        commandId: string
        error: string
    }

export type OnCommandEvent = (event: CommandEvent) => Promise<void>

export type CommandExecutionResult =
    | MessageCommandResult
    | OneAuthCommandResult
    | StatusCommandResult
    | TerminalCommandResult

export type CommandExecutionContext = {
    getUserInput: GetUserInput
    onCommandEvent?: OnCommandEvent
    runCommandById: (id: string) => Promise<CommandExecutionResult[]>
    commandsById: ReadonlyMap<string, CommandConfig>
}
