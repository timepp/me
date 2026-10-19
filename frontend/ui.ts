import {
    api,
    type CommandConfig,
    type CommandDraft,
    type CommandExecutionResult,
    type GetUserInput,
} from '../api.ts'
import { showOneAuthAccounts } from './components/one-auth-manager.ts'
import * as uu from './uu.ts'

type CommandType = CommandDraft['type']
type StatusDisplay = 'unknown' | 'satisfied' | 'unsatisfied' | 'error'
type CachedStatus = StatusDisplay | 'refreshing'

const commandTypes: CommandType[] = [
    'url',
    'terminal',
    'code',
    'message',
    'oneAuth',
    'compound',
    'registry',
    'pathEntry',
    'scheduledTask',
    'shortcut',
    'junction',
    'fileContent',
    'powerShell',
]

const configurationCommandTypes: CommandType[] = [
    'registry',
    'pathEntry',
    'scheduledTask',
    'shortcut',
    'junction',
    'fileContent',
    'powerShell',
]

function isConfigurationCommandType(type: CommandType): boolean {
    return configurationCommandTypes.includes(type)
}

function createButton(
    label: string,
    onClick: () => void | Promise<void>,
    style = 'btn-outline-primary',
): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `btn ${style}`
    button.textContent = label
    button.onclick = () => void onClick()
    return button
}

function createField(
    label: string,
    value = '',
    options: { required?: boolean; multiline?: boolean; type?: string } = {},
): HTMLInputElement | HTMLTextAreaElement {
    const group = document.createElement('label')
    group.className = 'command-form-field'

    const caption = document.createElement('span')
    caption.textContent = label
    group.append(caption)

    const input = options.multiline
        ? document.createElement('textarea')
        : document.createElement('input')
    input.className = 'form-control'
    input.value = value
    input.required = options.required ?? false
    if (input instanceof HTMLInputElement && options.type) {
        input.type = options.type
    }
    group.append(input)
    return input
}

function createSelect(
    label: string,
    values: string[],
    selected: string,
): HTMLSelectElement {
    const group = document.createElement('label')
    group.className = 'command-form-field'
    const caption = document.createElement('span')
    caption.textContent = label
    const select = document.createElement('select')
    select.className = 'form-select'
    for (const value of values) {
        const option = document.createElement('option')
        option.value = value
        option.textContent = value
        option.selected = value === selected
        select.append(option)
    }
    group.append(caption, select)
    return select
}

function toDraft(command: CommandConfig): CommandDraft {
    const common = {
        name: command.name,
        description: command.description,
        tags: command.tags,
    }
    switch (command.type) {
        case 'url':
            return {
                ...common,
                type: 'url',
                url: command.url,
                profile: command.profile,
            }
        case 'terminal':
            return {
                ...common,
                type: 'terminal',
                command: command.command,
                args: command.args,
                statusPort: command.statusPort,
            }
        case 'code':
            return { ...common, type: 'code', path: command.path }
        case 'message':
            return { ...common, type: 'message', content: command.content }
        case 'oneAuth':
            return { ...common, type: 'oneAuth' }
        case 'compound':
            return {
                ...common,
                type: 'compound',
                mode: command.mode,
                subCommandIds: [...command.subCommandIds],
            }
        case 'registry':
            return {
                ...common,
                type: command.type,
                elevated: command.elevated,
                values: command.values,
            }
        case 'pathEntry':
            return {
                ...common,
                type: command.type,
                elevated: command.elevated,
                entries: command.entries,
            }
        case 'scheduledTask':
            return {
                ...common,
                type: command.type,
                elevated: command.elevated,
                taskName: command.taskName,
                executable: command.executable,
                args: command.args,
                runLevel: command.runLevel,
            }
        case 'shortcut':
            return {
                ...common,
                type: command.type,
                elevated: command.elevated,
                path: command.path,
                target: command.target,
                args: command.args,
            }
        case 'junction':
            return {
                ...common,
                type: command.type,
                elevated: command.elevated,
                path: command.path,
                target: command.target,
            }
        case 'fileContent':
            return {
                ...common,
                type: command.type,
                elevated: command.elevated,
                path: command.path,
                marker: command.marker,
                content: command.content,
            }
        case 'powerShell':
            return {
                ...common,
                type: command.type,
                elevated: command.elevated,
                applyScript: command.applyScript,
                statusScript: command.statusScript,
            }
    }
}

function getSubCommands(
    command: CommandConfig,
    commandsById: ReadonlyMap<string, CommandConfig>,
): CommandConfig[] {
    if (command.type !== 'compound') return []
    return command.subCommandIds.map((id) => {
        const subCommand = commandsById.get(id)
        if (!subCommand) throw new Error(`Referenced command not found: ${id}`)
        return subCommand
    })
}

function referencesCommand(
    command: CommandConfig,
    targetId: string,
    commandsById: ReadonlyMap<string, CommandConfig>,
    visited = new Set<string>(),
): boolean {
    if (command.type !== 'compound' || visited.has(command.id)) return false
    visited.add(command.id)
    return command.subCommandIds.some((id) => {
        if (id === targetId) return true
        const subCommand = commandsById.get(id)
        return subCommand
            ? referencesCommand(subCommand, targetId, commandsById, visited)
            : false
    })
}

function commandDetails(
    command: CommandConfig,
    commandsById: ReadonlyMap<string, CommandConfig>,
): string {
    switch (command.type) {
        case 'url':
            return command.profile
                ? `${command.url} (${command.profile})`
                : command.url
        case 'terminal':
            return [command.command, ...command.args].join(' ')
        case 'code':
            return command.path
        case 'message':
            return command.content
        case 'oneAuth':
            return 'Manage OneAuth accounts'
        case 'compound':
            return `${command.mode}: ${
                getSubCommands(command, commandsById).map((item) => item.name)
                    .join(', ')
            }`
        case 'registry':
            return `${command.values.length} registry value(s)`
        case 'pathEntry':
            return command.entries.join('; ')
        case 'scheduledTask':
            return `${command.taskName}: ${command.executable}`
        case 'shortcut':
            return `${command.path} -> ${command.target}`
        case 'junction':
            return `${command.path} -> ${command.target}`
        case 'fileContent':
            return `${command.path}: ${command.marker}`
        case 'powerShell':
            return command.elevated ? 'Elevated PowerShell' : 'PowerShell'
    }
}

function hasStatus(command: CommandConfig): boolean {
    return command.type === 'terminal' ? command.statusPort !== undefined : [
        'registry',
        'pathEntry',
        'scheduledTask',
        'shortcut',
        'junction',
        'fileContent',
        'powerShell',
    ].includes(command.type)
}

async function getCommandStatus(
    command: CommandConfig,
): Promise<StatusDisplay> {
    return (await api.getCommandStatus(command.id)).state
}

function formatStatus(status: CachedStatus): string {
    return status === 'refreshing'
        ? ''
        : status === 'satisfied'
        ? '✅'
        : status === 'unsatisfied'
        ? '❌'
        : status === 'error'
        ? '⚠️'
        : ''
}

function statusSortingValue(status: CachedStatus): number {
    switch (status) {
        case 'satisfied':
            return 0
        case 'unsatisfied':
            return 1
        case 'error':
            return 2
        case 'unknown':
            return 3
        case 'refreshing':
            return 4
    }
}

function updateStatusElement(
    element: HTMLElement,
    status: CachedStatus,
): void {
    element.textContent = formatStatus(status)
    element.className = status === 'refreshing' ? 'loader' : ''
}

async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length)
    let nextIndex = 0
    const worker = async () => {
        while (true) {
            const index = nextIndex++
            if (index >= items.length) return
            results[index] = await mapper(items[index])
        }
    }
    await Promise.all(
        Array.from(
            { length: Math.min(concurrency, items.length) },
            worker,
        ),
    )
    return results
}

const getUserInput: GetUserInput = async (
    topic,
    choices,
    allowFreeString,
) => {
    let value: string | undefined
    const content = document.createElement('div')
    content.className = 'command-input'

    const topicElement = document.createElement('p')
    topicElement.textContent = topic
    content.append(topicElement)

    let choiceInput: HTMLSelectElement | undefined
    if (choices?.length) {
        choiceInput = document.createElement('select')
        choiceInput.className = 'form-select'
        for (const choice of choices) {
            const option = document.createElement('option')
            option.value = choice
            option.textContent = choice
            choiceInput.append(option)
        }
        content.append(choiceInput)
    }

    let freeInput: HTMLInputElement | undefined
    if (allowFreeString) {
        freeInput = document.createElement('input')
        freeInput.className = 'form-control'
        freeInput.type = 'text'
        content.append(freeInput)
    }

    await uu.showInDialog('Command input', content, {
        OK: () => {
            value = freeInput?.value.trim() || choiceInput?.value || ''
            return true
        },
        Cancel: () => true,
    })
    return value
}

async function showCommandResult(
    result: CommandExecutionResult,
): Promise<void> {
    switch (result.type) {
        case 'message': {
            const content = document.createElement('div')
            if (result.description) {
                const description = document.createElement('p')
                description.textContent = result.description
                content.append(description)
            }
            const message = document.createElement('code')
            message.textContent = result.content
            content.append(message)
            await uu.showInDialog(result.title, content)
            return
        }
        case 'oneAuth':
            await showOneAuthAccounts(result.accounts, result.title)
            return
        case 'status':
            console.log(
                `${result.title}: ${result.status.state}`,
                result.status.message ?? '',
            )
    }
}

async function showCommandDialog(
    type: CommandType,
    commands: CommandConfig[],
    initial?: CommandDraft,
    editingId?: string,
): Promise<CommandDraft | null> {
    if (isConfigurationCommandType(type)) {
        return await showConfigurationCommandDialog(type, initial)
    }
    const content = document.createElement('div')
    content.className = 'command-form'

    const nameInput = createField('Name', initial?.name, { required: true })
    const descriptionInput = createField('Description', initial?.description, {
        multiline: true,
    })
    const tagsInput = createField(
        'Tags (comma separated)',
        initial?.tags?.join(', '),
    )
    content.append(
        nameInput.parentElement!,
        descriptionInput.parentElement!,
        tagsInput.parentElement!,
    )

    let urlInput: HTMLInputElement | HTMLTextAreaElement | undefined
    let profileInput: HTMLInputElement | HTMLTextAreaElement | undefined
    let executableInput: HTMLInputElement | HTMLTextAreaElement | undefined
    let argsInput: HTMLInputElement | HTMLTextAreaElement | undefined
    let statusPortInput: HTMLInputElement | HTMLTextAreaElement | undefined
    let pathInput: HTMLInputElement | HTMLTextAreaElement | undefined
    let messageInput: HTMLInputElement | HTMLTextAreaElement | undefined
    let modeInput: HTMLSelectElement | undefined

    if (type === 'url') {
        urlInput = createField(
            'URL',
            initial?.type === 'url' ? initial.url : '',
            { required: true },
        )
        profileInput = createField(
            'Chrome profile (optional)',
            initial?.type === 'url' ? initial.profile : '',
        )
        content.append(urlInput.parentElement!, profileInput.parentElement!)
    } else if (type === 'terminal') {
        executableInput = createField(
            'Executable',
            initial?.type === 'terminal' ? initial.command : '',
            { required: true },
        )
        argsInput = createField(
            'Arguments (one per line)',
            initial?.type === 'terminal' ? initial.args.join('\n') : '',
            { multiline: true },
        )
        statusPortInput = createField(
            'Status port (optional)',
            initial?.type === 'terminal' && initial.statusPort !== undefined
                ? String(initial.statusPort)
                : '',
            { type: 'number' },
        )
        content.append(
            executableInput.parentElement!,
            argsInput.parentElement!,
            statusPortInput.parentElement!,
        )
    } else if (type === 'code') {
        pathInput = createField(
            'Directory (%MYSELF% means this app directory)',
            initial?.type === 'code' ? initial.path : '',
            { required: true },
        )
        content.append(pathInput.parentElement!)
    } else if (type === 'message') {
        messageInput = createField(
            'Message',
            initial?.type === 'message' ? initial.content : '',
            { required: true, multiline: true },
        )
        content.append(messageInput.parentElement!)
    }

    async function showConfigurationCommandDialog(
        type: CommandType,
        initial?: CommandDraft,
    ): Promise<CommandDraft | null> {
        const content = document.createElement('div')
        content.className = 'command-form'
        const nameInput = createField('Name', initial?.name, { required: true })
        const descriptionInput = createField(
            'Description',
            initial?.description,
            { multiline: true },
        )
        const tagsInput = createField(
            'Tags (comma separated)',
            initial?.tags?.join(', '),
        )
        const config = initial ? structuredClone(initial) : { type }
        delete (config as Partial<CommandDraft>).name
        delete (config as Partial<CommandDraft>).description
        delete (config as Partial<CommandDraft>).tags
        delete (config as Partial<CommandDraft>).type
        const configInput = createField(
            'Type-specific JSON',
            JSON.stringify(config, null, 4),
            { required: true, multiline: true },
        )
        content.append(
            nameInput.parentElement!,
            descriptionInput.parentElement!,
            tagsInput.parentElement!,
            configInput.parentElement!,
        )

        let result: CommandDraft | null = null
        await uu.showInDialog(
            `${initial ? 'Edit' : 'Add'} ${type} command`,
            content,
            {
                Save: () => {
                    try {
                        result = {
                            ...JSON.parse(configInput.value),
                            type,
                            name: nameInput.value.trim(),
                            description: descriptionInput.value.trim() ||
                                undefined,
                            tags: tagsInput.value.split(',').map((tag) =>
                                tag.trim()
                            )
                                .filter(Boolean),
                        }
                        return true
                    } catch (error) {
                        alert(
                            error instanceof Error
                                ? error.message
                                : String(error),
                        )
                        return false
                    }
                },
                Cancel: () => true,
            },
        )
        return result
    }

    const selectedCommandIds = new Set(
        initial?.type === 'compound' ? initial.subCommandIds : [],
    )

    if (type === 'compound') {
        modeInput = createSelect(
            'Run mode',
            ['all', 'choose'],
            initial?.type === 'compound' ? initial.mode : 'all',
        )
        content.append(modeInput.parentElement!)

        const section = document.createElement('section')
        section.className = 'sub-command-section'
        const heading = document.createElement('strong')
        heading.textContent = 'Select existing commands'
        const list = document.createElement('div')
        list.className = 'sub-command-list'
        const commandsById = new Map(
            commands.map((command) => [command.id, command]),
        )
        for (const command of commands) {
            if (
                command.id === editingId ||
                (editingId &&
                    referencesCommand(command, editingId, commandsById))
            ) {
                continue
            }
            const row = document.createElement('label')
            row.className = 'sub-command-row'
            const checkbox = document.createElement('input')
            checkbox.type = 'checkbox'
            checkbox.checked = selectedCommandIds.has(command.id)
            checkbox.onchange = () => {
                if (checkbox.checked) {
                    selectedCommandIds.add(command.id)
                } else {
                    selectedCommandIds.delete(command.id)
                }
            }
            const summary = document.createElement('span')
            summary.textContent = `${command.name} (${command.type})`
            row.append(checkbox, summary)
            list.append(row)
        }
        if (list.childElementCount === 0) {
            const empty = document.createElement('span')
            empty.className = 'text-muted'
            empty.textContent = 'No other commands are available'
            list.append(empty)
        }
        section.append(heading, list)
        content.append(section)
    }

    let result: CommandDraft | null = null
    await uu.showInDialog(
        `${initial ? 'Edit' : 'Add'} ${type} command`,
        content,
        {
            Save: () => {
                const name = nameInput.value.trim()
                if (!name) {
                    alert('Please fill in all required fields.')
                    return false
                }
                const common = {
                    name,
                    description: descriptionInput.value.trim() || undefined,
                    tags: tagsInput.value.split(',').map((tag) => tag.trim())
                        .filter(Boolean),
                }
                switch (type) {
                    case 'url': {
                        const url = urlInput!.value.trim()
                        if (!url) return false
                        result = {
                            ...common,
                            type,
                            url,
                            profile: profileInput!.value.trim() || undefined,
                        }
                        break
                    }
                    case 'terminal': {
                        const command = executableInput!.value.trim()
                        const statusPortText = statusPortInput!.value.trim()
                        const statusPort = statusPortText
                            ? Number(statusPortText)
                            : undefined
                        if (
                            !command ||
                            (statusPort !== undefined &&
                                (!Number.isInteger(statusPort) ||
                                    statusPort < 1 || statusPort > 65535))
                        ) {
                            alert('Executable and status port must be valid.')
                            return false
                        }
                        result = {
                            ...common,
                            type,
                            command,
                            args: argsInput!.value.split('\n').map((arg) =>
                                arg.trim()
                            ).filter(Boolean),
                            statusPort,
                        }
                        break
                    }
                    case 'code': {
                        const path = pathInput!.value.trim()
                        if (!path) return false
                        result = { ...common, type, path }
                        break
                    }
                    case 'message': {
                        const message = messageInput!.value.trim()
                        if (!message) return false
                        result = { ...common, type, content: message }
                        break
                    }
                    case 'oneAuth':
                        result = { ...common, type }
                        break
                    case 'compound':
                        result = {
                            ...common,
                            type,
                            mode: modeInput!.value as 'all' | 'choose',
                            subCommandIds: commands
                                .filter((command) =>
                                    selectedCommandIds.has(command.id)
                                )
                                .map((command) => command.id),
                        }
                        break
                }
                return true
            },
            Cancel: () => true,
        },
    )
    return result
}

async function main(): Promise<void> {
    uu.enableFontAwesome()

    const root = document.createElement('main')
    root.className = 'command-manager'
    document.body.append(root)
    const toolbar = document.createElement('div')
    toolbar.className = 'command-toolbar'
    root.append(toolbar)
    let visualization: HTMLElement | undefined
    const statusCache = new Map<string, CachedStatus>()
    let commands: CommandConfig[] = []
    let commandsById = new Map<string, CommandConfig>()
    let loadGeneration = 0

    const run = async (command: CommandConfig) => {
        try {
            const results = await api.runConfiguredCommand(
                command.id,
                getUserInput,
            )
            for (const result of results) await showCommandResult(result)
            const statusResult = results.find((result) =>
                result.type === 'status' && result.commandId === command.id
            )
            if (statusResult?.type === 'status') {
                statusCache.set(command.id, statusResult.status.state)
                renderVisualization()
            } else if (hasStatus(command)) {
                await refreshStatus(command)
            }
        } catch (error) {
            alert(
                `Failed to run command: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            )
        }
    }
    const renderVisualization = () => {
        const rows = commands.map((command) => ({
            ...command,
            status: statusCache.get(command.id) ?? 'unknown',
        }))
        const table = uu.visualizeArray(rows, {
            renderStyles: ['table', 'tile'],
            getSortingValue: (item, prop) =>
                prop === 'status' ? statusSortingValue(item.status) : undefined,
            renderOption: {
                props: [
                    'type',
                    'name',
                    'description',
                    'tags',
                    'details',
                    'status',
                ],
                propOptions: {
                    details: {
                        formatter: (item) => commandDetails(item, commandsById),
                    },
                    tags: {
                        formatter: (item) => item.tags?.join(', ') ?? '',
                    },
                    status: {
                        formatter: (item) => {
                            const element = document.createElement('span')
                            updateStatusElement(element, item.status)
                            return element
                        },
                    },
                },
                onItemClick: async (item) => {
                    await run(item)
                    return true
                },
            },
            itemActions: (item) => {
                const actions: uu.ItemActions = {
                    Run: async () => await run(item),
                    Edit: async () => {
                        const draft = await showCommandDialog(
                            item.type,
                            commands,
                            toDraft(item),
                            item.id,
                        )
                        if (!draft) return
                        try {
                            await api.updateCommand(item.id, draft)
                            await loadCommands()
                        } catch (error) {
                            alert(
                                `Failed to update command: ${
                                    error instanceof Error
                                        ? error.message
                                        : String(error)
                                }`,
                            )
                        }
                    },
                    Delete: async () => {
                        if (!confirm(`Delete command "${item.name}"?`)) return
                        try {
                            await api.deleteCommand(item.id)
                            await loadCommands()
                        } catch (error) {
                            alert(
                                `Failed to delete command: ${
                                    error instanceof Error
                                        ? error.message
                                        : String(error)
                                }`,
                            )
                        }
                    },
                }
                if (hasStatus(item)) {
                    actions['Refresh Status'] = async () => {
                        await refreshStatus(item)
                    }
                }
                return actions
            },
            hideUniformProps: false,
            rawIndexProp: '#',
            stateKey: 'MyEnvCommands',
        })
        if (visualization) visualization.replaceWith(table)
        else root.append(table)
        visualization = table
    }

    const refreshStatus = async (command: CommandConfig): Promise<void> => {
        try {
            statusCache.set(command.id, await getCommandStatus(command))
        } catch {
            statusCache.set(command.id, 'error')
        }
        renderVisualization()
    }

    const refreshAllStatuses = async (generation: number): Promise<void> => {
        const commandSnapshot = [...commands]
        const statuses = await mapWithConcurrency(
            commandSnapshot,
            5,
            async (command): Promise<[string, CachedStatus]> => {
                if (!hasStatus(command)) return [command.id, 'unknown']
                try {
                    return [command.id, await getCommandStatus(command)]
                } catch {
                    return [command.id, 'error']
                }
            },
        )
        if (generation !== loadGeneration) return
        statusCache.clear()
        for (const [id, status] of statuses) statusCache.set(id, status)
        renderVisualization()
    }

    const loadCommands = async (refreshStatuses = false): Promise<void> => {
        const generation = ++loadGeneration
        commands = await api.getCommands()
        commandsById = new Map(commands.map((command) => [command.id, command]))
        const previousStatuses = new Map(statusCache)
        statusCache.clear()
        for (const command of commands) {
            const previousStatus = previousStatuses.get(command.id)
            statusCache.set(
                command.id,
                refreshStatuses && hasStatus(command)
                    ? 'refreshing'
                    : previousStatus === 'refreshing'
                    ? 'unknown'
                    : previousStatus ?? 'unknown',
            )
        }
        renderVisualization()
        if (refreshStatuses) void refreshAllStatuses(generation)
    }

    for (const type of commandTypes) {
        toolbar.append(createButton(`Add ${type}`, async () => {
            const draft = await showCommandDialog(type, commands)
            if (!draft) return
            try {
                await api.addCommand(draft)
                await loadCommands()
            } catch (error) {
                alert(
                    `Failed to add command: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                )
            }
        }))
    }

    try {
        await loadCommands(true)
    } catch (error) {
        root.textContent = `Failed to load commands: ${
            error instanceof Error ? error.message : String(error)
        }`
    }
}

document.addEventListener('DOMContentLoaded', () => void main(), false)
