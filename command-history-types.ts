import type { CommandConfig } from './command.ts'
import type {
    CommandExecutionResult,
    TerminalCommandResult,
} from './commands/types.ts'

export type CommandRunState = 'running' | 'completed' | 'failed'

export type CommandRunStats = {
    runcount: number
    lastrun: string | null
}

export type CommandRunSummary = {
    id: string
    commandId: string
    title: string
    state: CommandRunState
    startedAt: string
    finishedAt?: string
    error?: string
}

export type CommandProcessRecord = {
    id: string
    commandId: string
    title: string
    state: CommandRunState
    stdout: string
    stderr: string
    result?: TerminalCommandResult
    error?: string
}

export type CommandRunRecord = CommandRunSummary & {
    command: CommandConfig
    results: CommandExecutionResult[]
    processes: CommandProcessRecord[]
}

export type OnCommandRunStarted = (run: CommandRunSummary) => Promise<void>
