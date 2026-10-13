export type CommandType =
    | 'url'
    | 'terminal'
    | 'code'
    | 'message'
    | 'oneAuth'
    | 'compound'

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

export type CommandConfig =
    | UrlCommandConfig
    | TerminalCommandConfig
    | CodeCommandConfig
    | MessageCommandConfig
    | OneAuthCommandConfig
    | CompoundCommandConfig

type CommandDraftBase = Omit<CommandBase, 'id'>

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

export type CommandDraft =
    | UrlCommandDraft
    | TerminalCommandDraft
    | CodeCommandDraft
    | MessageCommandDraft
    | OneAuthCommandDraft
    | CompoundCommandDraft

export class CommandManager {
    private mutationQueue: Promise<void> = Promise.resolve()

    constructor(
        private readonly configUrl: string | URL = new URL(
            './commands.json',
            import.meta.url,
        ),
    ) {}

    async getCommands(): Promise<CommandConfig[]> {
        return await this.readCommands()
    }

    async addCommand(draft: CommandDraft): Promise<CommandConfig> {
        const command = commandFromDraft(parseCommandDraft(draft))
        await this.mutate((commands) => {
            commands.push(command)
        })
        return structuredClone(command)
    }

    async updateCommand(
        id: string,
        draft: CommandDraft,
    ): Promise<CommandConfig> {
        const parsedId = requireGuid(id, 'id')
        const command = commandFromDraft(parseCommandDraft(draft), parsedId)
        await this.mutate((commands) => {
            const index = commands.findIndex((item) => item.id === parsedId)
            if (index === -1) throw new Error(`Command not found: ${parsedId}`)
            commands[index] = command
        })
        return structuredClone(command)
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
        default:
            throw new TypeError(
                `${path}.type must be "url", "terminal", "code", "message", "oneAuth", or "compound"`,
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

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
