export type CommandStatusState =
    | 'satisfied'
    | 'unsatisfied'
    | 'unknown'
    | 'error'

export type CommandStatus = {
    state: CommandStatusState
    message?: string
}

export const satisfied = (message?: string): CommandStatus => ({
    state: 'satisfied',
    message,
})

export const unsatisfied = (message?: string): CommandStatus => ({
    state: 'unsatisfied',
    message,
})

export const unknown = (message?: string): CommandStatus => ({
    state: 'unknown',
    message,
})

export const statusError = (error: unknown): CommandStatus => ({
    state: 'error',
    message: error instanceof Error ? error.message : String(error),
})
