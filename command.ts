import { executeCommand } from './commands/execute-command.ts'
import { dirname, resolve } from 'node:path'
import { CommandHistoryStore } from './command-history.ts'
import type { CommandRunStats, OnCommandRunStarted } from './command-history-types.ts'
import { getCommandStatus } from './commands/get-command-status.ts'
import type { CommandStatus } from './commands/status.ts'
import type {
    CommandExecutionResult,
    GetUserInput,
    OnCommandEvent,
} from './commands/types.ts'

export type {
    CommandEvent,
    CommandExecutionResult,
    GetUserInput,
    OnCommandEvent,
    TerminalCommandResult,
} from './commands/types.ts'
export type { CommandStatus } from './commands/status.ts'

export type CommandType =
    | 'url'
    | 'terminal'
    | 'code'
    | 'message'
    | 'oneAuth'
    | 'compound'
    | 'registry'
    | 'pathEntry'
    | 'scheduledTask'
    | 'shortcut'
    | 'junction'
    | 'fileContent'
    | 'powerShell'

type CommandBase = {
    id: string
    name: string
    description?: string
    tags?: string[]
}

export type UrlCommandConfig = CommandBase & {
    type: 'url'
    url: string
    profile?: string
}

export type TerminalCommandConfig = CommandBase & {
    type: 'terminal'
    command: string
    args: string[]
    statusPort?: number
}

export type CodeCommandConfig = CommandBase & {
    type: 'code'
    path: string
}

export type MessageCommandConfig = CommandBase & {
    type: 'message'
    content: string
}

export type OneAuthCommandConfig = CommandBase & {
    type: 'oneAuth'
}

export type CompoundCommandConfig = CommandBase & {
    type: 'compound'
    mode: 'all' | 'choose'
    subCommandIds: string[]
}

type StatusCommandBase = CommandBase & {
    elevated?: boolean
}

export type RegistryValue = {
    key: string
    name?: string
    value: string | number | string[]
}

export type RegistryCommandConfig = StatusCommandBase & {
    type: 'registry'
    values: RegistryValue[]
}

export type PathEntryCommandConfig = StatusCommandBase & {
    type: 'pathEntry'
    entries: string[]
}

export type ScheduledTaskCommandConfig = StatusCommandBase & {
    type: 'scheduledTask'
    taskName: string
    executable: string
    args: string[]
    runLevel: 'normal' | 'highest'
}

export type ShortcutCommandConfig = StatusCommandBase & {
    type: 'shortcut'
    path: string
    target: string
    args?: string
}

export type JunctionCommandConfig = StatusCommandBase & {
    type: 'junction'
    path: string
    target: string
}

export type FileContentCommandConfig = StatusCommandBase & {
    type: 'fileContent'
    path: string
    marker: string
    content: string
}

export type PowerShellCommandConfig = StatusCommandBase & {
    type: 'powerShell'
    applyScript: string
    statusScript?: string
}

export type CommandConfig =
    | UrlCommandConfig
    | TerminalCommandConfig
    | CodeCommandConfig
    | MessageCommandConfig
    | OneAuthCommandConfig
    | CompoundCommandConfig
    | RegistryCommandConfig
    | PathEntryCommandConfig
    | ScheduledTaskCommandConfig
    | ShortcutCommandConfig
    | JunctionCommandConfig
    | FileContentCommandConfig
    | PowerShellCommandConfig

type CommandDraftBase = Omit<CommandBase, 'id'>

export type CommandWithRunStats = CommandConfig & CommandRunStats

export type UrlCommandDraft = CommandDraftBase & {
    type: 'url'
    url: string
    profile?: string
}

export type TerminalCommandDraft = CommandDraftBase & {
    type: 'terminal'
    command: string
    args: string[]
    statusPort?: number
}

export type CodeCommandDraft = CommandDraftBase & {
    type: 'code'
    path: string
}

export type MessageCommandDraft = CommandDraftBase & {
    type: 'message'
    content: string
}

export type OneAuthCommandDraft = CommandDraftBase & {
    type: 'oneAuth'
}

export type CompoundCommandDraft = CommandDraftBase & {
    type: 'compound'
    mode: 'all' | 'choose'
    subCommandIds: string[]
}

export type RegistryCommandDraft = Omit<RegistryCommandConfig, 'id'>
export type PathEntryCommandDraft = Omit<PathEntryCommandConfig, 'id'>
export type ScheduledTaskCommandDraft = Omit<ScheduledTaskCommandConfig, 'id'>
export type ShortcutCommandDraft = Omit<ShortcutCommandConfig, 'id'>
export type JunctionCommandDraft = Omit<JunctionCommandConfig, 'id'>
export type FileContentCommandDraft = Omit<FileContentCommandConfig, 'id'>
export type PowerShellCommandDraft = Omit<PowerShellCommandConfig, 'id'>

export type CommandDraft =
    | UrlCommandDraft
    | TerminalCommandDraft
    | CodeCommandDraft
    | MessageCommandDraft
    | OneAuthCommandDraft
    | CompoundCommandDraft
    | RegistryCommandDraft
    | PathEntryCommandDraft
    | ScheduledTaskCommandDraft
    | ShortcutCommandDraft
    | JunctionCommandDraft
    | FileContentCommandDraft
    | PowerShellCommandDraft

export class CommandManager {
    private mutationQueue: Promise<void> = Promise.resolve()
    private readonly history: CommandHistoryStore

    constructor(
        private readonly configUrl: string | URL = new URL(
            './commands.json',
            import.meta.url,
        ),
        historyPath: string | URL = configUrl instanceof URL
            ? new URL('./command-history.sqlite', configUrl)
            : resolve(dirname(configUrl), 'command-history.sqlite'),
    ) {
        this.history = new CommandHistoryStore(historyPath)
    }

    getCommandRunHistory(commandId?: string) {
        return this.history.list(commandId)
    }

    getCommandRun(id: string) {
        return this.history.get(id)
    }

    close(): void {
        this.history.close()
    }

    async getCommands(): Promise<CommandWithRunStats[]> {
        return this.withRunStats(await this.readCommands())
    }

    async addCommand(draft: CommandDraft): Promise<CommandWithRunStats> {
        const command = commandFromDraft(parseCommandDraft(draft))
        await this.mutate((commands) => {
            commands.push(command)
        })
        return this.withRunStats([command])[0]
    }

    async updateCommand(
        id: string,
        draft: CommandDraft,
    ): Promise<CommandWithRunStats> {
        const parsedId = requireGuid(id, 'id')
        const command = commandFromDraft(parseCommandDraft(draft), parsedId)
        await this.mutate((commands) => {
            const index = commands.findIndex((item) => item.id === parsedId)
            if (index === -1) throw new Error(`Command not found: ${parsedId}`)
            commands[index] = command
        })
        return this.withRunStats([command])[0]
    }

    private withRunStats(commands: CommandConfig[]): CommandWithRunStats[] {
        const stats = this.history.getRunStats()
        return commands.map(command => ({
            ...command,
            ...(stats.get(command.id) ?? { runcount: 0, lastrun: null }),
        }))
    }

    async deleteCommand(id: string): Promise<void> {
        const parsedId = requireGuid(id, 'id')
        await this.mutate((commands) => {
            const index = commands.findIndex((item) => item.id === parsedId)
            if (index === -1) throw new Error(`Command not found: ${parsedId}`)
            const referencing = commands.find((command) =>
                command.type === 'compound' &&
                command.subCommandIds.includes(parsedId)
            )
            if (referencing) {
                throw new Error(
                    `Command is used by compound command "${referencing.name}"`,
                )
            }
            commands.splice(index, 1)
        })
    }

    async runCommand(
        id: string,
        getUserInput: GetUserInput,
        onCommandEvent?: OnCommandEvent,
        onRunStarted?: OnCommandRunStarted,
    ): Promise<CommandExecutionResult[]> {
        const parsedId = requireGuid(id, 'id')
        const commands = await this.readCommands()
        const commandsById = new Map(
            commands.map((command) => [command.id, command]),
        )
        const command = commandsById.get(parsedId)
        if (!command) throw new Error(`Command not found: ${parsedId}`)
        const run = this.history.start(command)
        if (onRunStarted) {
            try {
                await onRunStarted(run)
            } catch (error) {
                console.error('Failed to notify client of command run:', error)
            }
        }
        let forwardEvent = onCommandEvent
        const recordEvent: OnCommandEvent = async event => {
            this.history.appendEvent(run.id, event)
            if (forwardEvent) {
                try {
                    await forwardEvent(event)
                } catch (error) {
                    console.error('Command output client disconnected:', error)
                    forwardEvent = undefined
                }
            }
        }
        const runCommandById = async (
            commandId: string,
        ): Promise<CommandExecutionResult[]> => {
            const command = commandsById.get(commandId)
            if (!command) throw new Error(`Command not found: ${commandId}`)
            const results = await executeCommand(command, {
                getUserInput,
                onCommandEvent: recordEvent,
                runCommandById,
                commandsById,
            })
            if (command.type !== 'compound' && results.length) {
                this.history.appendResults(run.id, results)
            }
            return results
        }
        try {
            const results = await runCommandById(parsedId)
            this.history.complete(run.id, results)
            return results
        } catch (error) {
            this.history.fail(run.id, error)
            throw error
        }
    }

    async getCommandStatus(id: string): Promise<CommandStatus> {
        const parsedId = requireGuid(id, 'id')
        const commands = await this.readCommands()
        const command = commands.find((item) => item.id === parsedId)
        if (!command) throw new Error(`Command not found: ${parsedId}`)
        return await getCommandStatus(command)
    }

    private async mutate(
        change: (commands: CommandConfig[]) => void,
    ): Promise<void> {
        const mutation = this.mutationQueue.then(async () => {
            const commands = await this.readCommands()
            change(commands)
            validateCommandReferences(commands)
            await Deno.writeTextFile(
                this.configUrl,
                `${JSON.stringify(commands, null, 4)}\n`,
            )
        })
        this.mutationQueue = mutation.catch(() => {})
        await mutation
    }

    private async readCommands(): Promise<CommandConfig[]> {
        const text = await Deno.readTextFile(this.configUrl)
        let value: unknown
        try {
            value = JSON.parse(text)
        } catch (error) {
            throw new SyntaxError(
                `Invalid command JSON in ${this.configUrl}: ${
                    errorMessage(error)
                }`,
            )
        }
        return parseCommandConfigs(value)
    }
}

export function parseCommandConfigs(value: unknown): CommandConfig[] {
    if (!Array.isArray(value)) {
        throw new TypeError('Command configuration must be an array')
    }
    const commands = value.map((item, index) =>
        parseCommandConfig(item, `commands[${index}]`)
    )
    validateCommandReferences(commands)
    return commands
}

export function parseCommandDraft(
    value: unknown,
    path = 'command',
): CommandDraft {
    return parseCommandValue(
        requireRecord(value, path),
        path,
        false,
    ) as CommandDraft
}

function parseCommandConfig(value: unknown, path: string): CommandConfig {
    return parseCommandValue(
        requireRecord(value, path),
        path,
        true,
    ) as CommandConfig
}

function parseCommandValue(
    record: Record<string, unknown>,
    path: string,
    requireId: boolean,
): CommandConfig | CommandDraft {
    const id = requireId ? requireGuid(record.id, `${path}.id`) : undefined
    const name = requireString(record.name, `${path}.name`)
    const description = optionalString(
        record.description,
        `${path}.description`,
    )
    const tags = optionalStringArray(record.tags, `${path}.tags`)
    const elevated = optionalBoolean(record.elevated, `${path}.elevated`)
    const type = requireString(record.type, `${path}.type`)
    const common = { ...(id ? { id } : {}), name, description, tags }

    switch (type) {
        case 'url':
            return {
                ...common,
                type,
                url: requireString(record.url, `${path}.url`),
                profile: optionalString(record.profile, `${path}.profile`),
            } as UrlCommandConfig | UrlCommandDraft
        case 'terminal':
            return {
                ...common,
                type,
                command: requireString(record.command, `${path}.command`),
                args: requireStringArray(record.args, `${path}.args`),
                statusPort: optionalPort(
                    record.statusPort,
                    `${path}.statusPort`,
                ),
            } as TerminalCommandConfig | TerminalCommandDraft
        case 'code':
            return {
                ...common,
                type,
                path: requireString(record.path, `${path}.path`),
            } as CodeCommandConfig | CodeCommandDraft
        case 'message':
            return {
                ...common,
                type,
                content: requireString(record.content, `${path}.content`),
            } as MessageCommandConfig | MessageCommandDraft
        case 'oneAuth':
            return { ...common, type } as
                | OneAuthCommandConfig
                | OneAuthCommandDraft
        case 'compound':
            return {
                ...common,
                type,
                mode: requireCompoundMode(record.mode, `${path}.mode`),
                subCommandIds: requireGuidArray(
                    record.subCommandIds,
                    `${path}.subCommandIds`,
                ),
            } as CompoundCommandConfig | CompoundCommandDraft
        case 'registry':
            return {
                ...common,
                type,
                elevated,
                values: requireRegistryValues(record.values, `${path}.values`),
            } as RegistryCommandConfig | RegistryCommandDraft
        case 'pathEntry':
            return {
                ...common,
                type,
                elevated,
                entries: requireStringArray(record.entries, `${path}.entries`),
            } as PathEntryCommandConfig | PathEntryCommandDraft
        case 'scheduledTask':
            return {
                ...common,
                type,
                elevated,
                taskName: requireString(record.taskName, `${path}.taskName`),
                executable: requireString(
                    record.executable,
                    `${path}.executable`,
                ),
                args: requireStringArray(record.args, `${path}.args`),
                runLevel: requireRunLevel(
                    record.runLevel,
                    `${path}.runLevel`,
                ),
            } as ScheduledTaskCommandConfig | ScheduledTaskCommandDraft
        case 'shortcut':
            return {
                ...common,
                type,
                elevated,
                path: requireString(record.path, `${path}.path`),
                target: requireString(record.target, `${path}.target`),
                args: optionalString(record.args, `${path}.args`),
            } as ShortcutCommandConfig | ShortcutCommandDraft
        case 'junction':
            return {
                ...common,
                type,
                elevated,
                path: requireString(record.path, `${path}.path`),
                target: requireString(record.target, `${path}.target`),
            } as JunctionCommandConfig | JunctionCommandDraft
        case 'fileContent':
            return {
                ...common,
                type,
                elevated,
                path: requireString(record.path, `${path}.path`),
                marker: requireString(record.marker, `${path}.marker`),
                content: requireString(record.content, `${path}.content`),
            } as FileContentCommandConfig | FileContentCommandDraft
        case 'powerShell':
            return {
                ...common,
                type,
                elevated,
                applyScript: requireString(
                    record.applyScript,
                    `${path}.applyScript`,
                ),
                statusScript: optionalString(
                    record.statusScript,
                    `${path}.statusScript`,
                ),
            } as PowerShellCommandConfig | PowerShellCommandDraft
        default:
            throw new TypeError(
                `${path}.type is not supported`,
            )
    }
}

function commandFromDraft(
    draft: CommandDraft,
    id: string = crypto.randomUUID(),
): CommandConfig {
    return { id, ...draft }
}

function validateCommandReferences(commands: CommandConfig[]): void {
    const byId = new Map<string, CommandConfig>()
    for (const command of commands) {
        if (byId.has(command.id)) {
            throw new TypeError(`Command id must be unique: ${command.id}`)
        }
        byId.set(command.id, command)
    }

    for (const command of commands) {
        if (command.type !== 'compound') continue
        const uniqueIds = new Set(command.subCommandIds)
        if (uniqueIds.size !== command.subCommandIds.length) {
            throw new TypeError(
                `Compound command "${command.name}" contains duplicate references`,
            )
        }
        for (const subCommandId of command.subCommandIds) {
            if (!byId.has(subCommandId)) {
                throw new TypeError(
                    `Compound command "${command.name}" references missing command: ${subCommandId}`,
                )
            }
        }
    }

    const visiting = new Set<string>()
    const visited = new Set<string>()
    const visit = (id: string) => {
        if (visiting.has(id)) {
            throw new TypeError(`Compound command cycle detected at: ${id}`)
        }
        if (visited.has(id)) return
        visiting.add(id)
        const command = byId.get(id)!
        if (command.type === 'compound') {
            for (const subCommandId of command.subCommandIds) {
                visit(subCommandId)
            }
        }
        visiting.delete(id)
        visited.add(id)
    }
    for (const command of commands) visit(command.id)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`${path} must be an object`)
    }
    return value as Record<string, unknown>
}

function requireString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new TypeError(`${path} must be a non-empty string`)
    }
    return value.trim()
}

function requireGuid(value: unknown, path: string): string {
    const id = requireString(value, path)
    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            .test(id)
    ) {
        throw new TypeError(`${path} must be a GUID`)
    }
    return id.toLowerCase()
}

function optionalString(value: unknown, path: string): string | undefined {
    if (value === undefined || value === '') return undefined
    return requireString(value, path)
}

function optionalStringArray(
    value: unknown,
    path: string,
): string[] | undefined {
    if (value === undefined) return undefined
    return requireStringArray(value, path)
}

function optionalBoolean(value: unknown, path: string): boolean | undefined {
    if (value === undefined) return undefined
    if (typeof value !== 'boolean') {
        throw new TypeError(`${path} must be boolean`)
    }
    return value
}

function requireRegistryValues(value: unknown, path: string): RegistryValue[] {
    if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`)
    return value.map((item, index) => {
        const itemPath = `${path}[${index}]`
        const record = requireRecord(item, itemPath)
        const rawValue = record.value
        const parsedValue = typeof rawValue === 'number'
            ? rawValue
            : Array.isArray(rawValue)
            ? requireStringArray(rawValue, `${itemPath}.value`)
            : requireString(rawValue, `${itemPath}.value`)
        return {
            key: requireString(record.key, `${itemPath}.key`),
            name: optionalString(record.name, `${itemPath}.name`),
            value: parsedValue,
        }
    })
}

function requireStringArray(value: unknown, path: string): string[] {
    if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`)
    return value.map((item, index) => requireString(item, `${path}[${index}]`))
}

function requireGuidArray(value: unknown, path: string): string[] {
    if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`)
    return value.map((item, index) => requireGuid(item, `${path}[${index}]`))
}

function optionalPort(value: unknown, path: string): number | undefined {
    if (value === undefined) return undefined
    if (
        !Number.isInteger(value) || (value as number) < 1 ||
        (value as number) > 65535
    ) {
        throw new TypeError(`${path} must be an integer between 1 and 65535`)
    }
    return value as number
}

function requireCompoundMode(value: unknown, path: string): 'all' | 'choose' {
    if (value !== 'all' && value !== 'choose') {
        throw new TypeError(`${path} must be "all" or "choose"`)
    }
    return value
}

function requireRunLevel(value: unknown, path: string): 'normal' | 'highest' {
    if (value !== 'normal' && value !== 'highest') {
        throw new TypeError(`${path} must be "normal" or "highest"`)
    }
    return value
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
