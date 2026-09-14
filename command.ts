export type CommandType = 'url' | 'compound'
export type CommandStatus = 'unknown' | 'yes' | 'no'
export type CommandResult = string | void

type CommandConfigBase = {
    name: string
    description?: string
    tags?: string[]
}

export type UrlCommandConfig = CommandConfigBase & {
    type: 'url'
    url: string
}

export type CompoundCommandConfig = CommandConfigBase & {
    type: 'compound'
    subCommands: CommandConfig[]
}

export type CommandConfig = UrlCommandConfig | CompoundCommandConfig

export interface ICommand {
    readonly name: string
    readonly type: CommandType
    readonly description?: string
    readonly tags: readonly string[]
    run(): Promise<CommandResult>
    getStatus(): Promise<CommandStatus>
}

export interface CommandRuntime {
    openUrl(url: string): Promise<string>
}

const defaultRuntime: CommandRuntime = {
    async openUrl(url: string) {
        const command = new Deno.Command('cmd', {
            args: ['/c', 'start', '', url],
            stdout: 'null',
            stderr: 'null',
        })
        const child = command.spawn()
        await child.status
        return `Opened ${url}`
    },
}

abstract class Command<TConfig extends CommandConfig> implements ICommand {
    readonly name: string
    readonly description?: string
    readonly tags: readonly string[]
    abstract readonly type: TConfig['type']

    protected constructor(config: TConfig) {
        this.name = config.name
        this.description = config.description
        this.tags = config.tags ?? []
    }

    abstract run(): Promise<CommandResult>

    async getStatus(): Promise<CommandStatus> {
        return 'unknown'
    }
}

export class UrlCommand extends Command<UrlCommandConfig> {
    readonly type = 'url' as const
    readonly url: string

    constructor(config: UrlCommandConfig, private readonly runtime: CommandRuntime = defaultRuntime) {
        super(config)
        this.url = config.url
    }

    run(): Promise<string> {
        return this.runtime.openUrl(this.url)
    }
}

export class CompoundCommand extends Command<CompoundCommandConfig> {
    readonly type = 'compound' as const
    readonly subCommands: readonly ICommand[]

    constructor(config: CompoundCommandConfig, runtime: CommandRuntime = defaultRuntime) {
        super(config)
        this.subCommands = config.subCommands.map(command => createCommand(command, runtime))
    }

    async run(): Promise<void> {
        for (const command of this.subCommands) {
            await command.run()
        }
    }

    override async getStatus(): Promise<CommandStatus> {
        const statuses = await Promise.all(this.subCommands.map(command => command.getStatus()))
        if (statuses.some(status => status === 'no')) return 'no'
        if (statuses.length > 0 && statuses.every(status => status === 'yes')) return 'yes'
        return 'unknown'
    }
}

export function createCommand(config: CommandConfig, runtime: CommandRuntime = defaultRuntime): ICommand {
    switch (config.type) {
        case 'url':
            return new UrlCommand(config, runtime)
        case 'compound':
            return new CompoundCommand(config, runtime)
    }
}

export function parseCommandConfigs(value: unknown): CommandConfig[] {
    if (!Array.isArray(value)) {
        throw new TypeError('Command configuration must be an array')
    }
    return value.map((item, index) => parseCommandConfig(item, `commands[${index}]`))
}

export function parseCommands(value: unknown, runtime: CommandRuntime = defaultRuntime): ICommand[] {
    return parseCommandConfigs(value).map(config => createCommand(config, runtime))
}

export async function getCommands(
    configUrl: string | URL = new URL('./commands.json', import.meta.url),
    runtime: CommandRuntime = defaultRuntime,
): Promise<ICommand[]> {
    const text = await Deno.readTextFile(configUrl)
    let value: unknown
    try {
        value = JSON.parse(text)
    } catch (error) {
        throw new SyntaxError(`Invalid command JSON in ${configUrl}: ${errorMessage(error)}`)
    }
    return parseCommands(value, runtime)
}

function parseCommandConfig(value: unknown, path: string): CommandConfig {
    const record = requireRecord(value, path)
    const name = requireString(record.name, `${path}.name`)
    const description = optionalString(record.description, `${path}.description`)
    const tags = optionalStringArray(record.tags, `${path}.tags`)
    const type = requireString(record.type, `${path}.type`)
    const common = { name, description, tags }

    switch (type) {
        case 'url':
            return { ...common, type, url: requireString(record.url, `${path}.url`) }
        case 'compound': {
            if (!Array.isArray(record.subCommands)) {
                throw new TypeError(`${path}.subCommands must be an array`)
            }
            const subCommands = record.subCommands.map((item, index) =>
                parseCommandConfig(item, `${path}.subCommands[${index}]`)
            )
            return { ...common, type, subCommands }
        }
        default:
            throw new TypeError(`${path}.type must be "url" or "compound"`)
    }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`${path} must be an object`)
    }
    return value as Record<string, unknown>
}

function requireString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`${path} must be a non-empty string`)
    }
    return value
}

function optionalString(value: unknown, path: string): string | undefined {
    return value === undefined ? undefined : requireString(value, path)
}

function optionalStringArray(value: unknown, path: string): string[] | undefined {
    if (value === undefined) return undefined
    if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`)
    return value.map((item, index) => requireString(item, `${path}[${index}]`))
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

