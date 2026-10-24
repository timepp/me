import {
    api,
    type CommandConfig,
    type CommandDraft,
    type CommandWithRunStats,
    type GetUserInput,
} from '../api.ts'
import { createRunHistoryDialogs } from './components/command-output.ts'
import { CommandRunHistory } from './components/command-run-history.ts'
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
    if (command.type === 'powerShell') return Boolean(command.statusScript)
    return command.type === 'terminal' ? command.statusPort !== undefined : [
        'registry',
        'pathEntry',
        'scheduledTask',
        'shortcut',
        'junction',
        'fileContent',
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
        : 'unknown'
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

type CommandCommonFields = Pick<CommandDraft, 'name' | 'description' | 'tags'>

type CommandForm = {
    content: HTMLElement
    readDraft: (common: CommandCommonFields) => CommandDraft | null
}

function createCommandForm(
    type: CommandType,
    commands: CommandConfig[],
    initial?: CommandDraft,
    editingId?: string,
): CommandForm {
    const content = document.createElement('div')
    content.className = 'command-type-fields'

    if (isConfigurationCommandType(type)) {
        const config: Partial<CommandDraft> = initial
            ? structuredClone(initial)
            : {}
        delete config.name
        delete config.description
        delete config.tags
        delete config.type
        const configInput = createField(
            'Type-specific JSON',
            JSON.stringify(config, null, 4),
            { required: true, multiline: true },
        )
        content.append(configInput.parentElement!)
        return {
            content,
            readDraft: (common) => {
                try {
                    const value: unknown = JSON.parse(configInput.value)
                    if (
                        !value || typeof value !== 'object' ||
                        Array.isArray(value)
                    ) {
                        throw new TypeError('Type-specific JSON must be an object.')
                    }
                    return { ...value, ...common, type } as CommandDraft
                } catch (error) {
                    alert(error instanceof Error ? error.message : String(error))
                    return null
                }
            },
        }
    }

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

    return {
        content,
        readDraft: (common) => {
            switch (type) {
                case 'url': {
                    const url = urlInput!.value.trim()
                    if (!url) {
                        alert('URL is required.')
                        return null
                    }
                    return {
                        ...common,
                        type,
                        url,
                        profile: profileInput!.value.trim() || undefined,
                    }
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
                        return null
                    }
                    return {
                        ...common,
                        type,
                        command,
                        args: argsInput!.value.split('\n').map((arg) =>
                            arg.trim()
                        ).filter(Boolean),
                        statusPort,
                    }
                }
                case 'code': {
                    const path = pathInput!.value.trim()
                    if (!path) {
                        alert('Directory is required.')
                        return null
                    }
                    return { ...common, type, path }
                }
                case 'message': {
                    const message = messageInput!.value.trim()
                    if (!message) {
                        alert('Message is required.')
                        return null
                    }
                    return { ...common, type, content: message }
                }
                case 'oneAuth':
                    return { ...common, type }
                case 'compound': {
                    const mode = modeInput!.value
                    if (mode !== 'all' && mode !== 'choose') {
                        throw new TypeError(`Invalid compound run mode: ${mode}`)
                    }
                    return {
                        ...common,
                        type,
                        mode,
                        subCommandIds: commands
                            .filter((command) =>
                                selectedCommandIds.has(command.id)
                            )
                            .map((command) => command.id),
                    }
                }
                default:
                    throw new TypeError(`Unsupported command type: ${type}`)
            }
        },
    }
}

async function showCommandDialog(
    type: CommandType,
    commands: CommandConfig[],
    initial?: CommandDraft,
    editingId?: string,
): Promise<CommandDraft | null> {
    const content = document.createElement('div')
    content.className = initial ? 'command-editor' : 'command-editor-layout'
    const form = document.createElement('div')
    form.className = 'command-form'
    const nameInput = createField('Name', initial?.name, { required: true })
    const descriptionInput = createField('Description', initial?.description, {
        multiline: true,
    })
    const tagsInput = createField(
        'Tags (comma separated)',
        initial?.tags?.join(', '),
    )
    const fields = document.createElement('div')
    form.append(
        nameInput.parentElement!,
        descriptionInput.parentElement!,
        tagsInput.parentElement!,
        fields,
    )
    const forms = new Map<CommandType, CommandForm>()
    let selectedForm: CommandForm
    const buttons = new Map<CommandType, HTMLButtonElement>()
    const selectType = (selectedType: CommandType) => {
        let selected = forms.get(selectedType)
        if (!selected) {
            selected = createCommandForm(
                selectedType,
                commands,
                initial,
                editingId,
            )
            forms.set(selectedType, selected)
        }
        selectedForm = selected
        fields.replaceChildren(selected.content)
        for (const [buttonType, button] of buttons) {
            const active = buttonType === selectedType
            button.classList.toggle('active', active)
            button.setAttribute('aria-pressed', String(active))
        }
    }
    if (!initial) {
        const navigation = document.createElement('nav')
        navigation.className = 'command-type-navigation'
        navigation.setAttribute('aria-label', 'Command type')
        for (const commandType of commandTypes) {
            const button = createButton(
                commandType,
                () => selectType(commandType),
            )
            buttons.set(commandType, button)
            navigation.append(button)
        }
        content.append(navigation)
    }
    content.append(form)
    selectType(type)

    let result: CommandDraft | null = null
    await uu.showDialog(
        initial ? `Edit ${type} command` : 'Add command',
        content,
        {
            classes: ['command-editor-dialog'],
            softDismissable: false,
            actions: {
                Save: () => {
                    const name = nameInput.value.trim()
                    if (!name) {
                        alert('Please fill in all required fields.')
                        return false
                    }
                    result = selectedForm.readDraft({
                        name,
                        description: descriptionInput.value.trim() || undefined,
                        tags: tagsInput.value.split(',').map((tag) =>
                            tag.trim()
                        ).filter(Boolean),
                    })
                    return result !== null
                },
                Cancel: () => true,
            },
        },
        ({ dialog }) => {
            queueMicrotask(() => {
                dialog.style.height = 'fit-content'
            })
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
    const history = new CommandRunHistory()
    const dialogs = createRunHistoryDialogs(history)
    toolbar.append(createButton('Run History', () => dialogs.showHistory()))
    let visualization: HTMLElement | undefined
    const statusCache = new Map<string, CachedStatus>()
    let commands: CommandWithRunStats[] = []
    let commandsById = new Map<string, CommandConfig>()
    let loadGeneration = 0

    const run = async (command: CommandConfig) => {
        try {
            const results = await api.runConfiguredCommand(
                command.id,
                getUserInput,
                undefined,
                summary => {
                    const record = history.accept(summary)
                    void dialogs.showRun(record).catch((error) => {
                        alert(error instanceof Error ? error.message : String(error))
                    })
                    return loadCommands().catch(error => {
                        alert(error instanceof Error ? error.message : String(error))
                    })
                },
            )
            const statusResult = results.find((result) =>
                result.type === 'status' && result.commandId === command.id
            )
            if (hasStatus(command) && statusResult?.type === 'status') {
                statusCache.set(command.id, statusResult.status.state)
                renderVisualization()
            } else if (hasStatus(command)) {
                await refreshStatus(command)
            }
        } catch (error) {
            alert(error instanceof Error ? error.message : String(error))
        }
    }
    const renderVisualization = () => {
        const rows = commands.map((command) => ({
            ...command,
            ...(hasStatus(command)
                ? { status: statusCache.get(command.id) ?? 'unknown' }
                : {}),
        }))
        const table = uu.visualizeArray(rows, {
            renderStyles: ['table', 'tile'],
            renderOption: {
                props: [
                    'type',
                    'name',
                    'description',
                    'tags',
                    'details',
                    'runcount',
                    'lastrun',
                    'status',
                ],
                propOptions: {
                    details: {
                        formatter: (item) => commandDetails(item, commandsById),
                    },
                    tags: {
                        formatter: (item) => item.tags?.join(', ') ?? '',
                    },
                }
            },
            itemActions: (item) => {
                const actions: uu.ItemActions = {
                    '▶️': async () => await run(item),
                    '🕘': () => dialogs.showHistory(item.id),
                    '✏️': async () => {
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
                    '🗑️': async () => {
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
                    actions['🔄'] = async () => {
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
        const commandSnapshot = commands.filter(hasStatus)
        for (const command of commandSnapshot) {
            statusCache.set(command.id, 'refreshing')
        }
        renderVisualization()
        const statuses = await mapWithConcurrency(
            commandSnapshot,
            5,
            async (command): Promise<[string, CachedStatus]> => {
                try {
                    return [command.id, await getCommandStatus(command)]
                } catch (error) {
                    console.error(`Failed to check status for "${command.name}":`, error)
                    return [command.id, 'error']
                }
            },
        )
        if (generation !== loadGeneration) return
        for (const [id, status] of statuses) statusCache.set(id, status)
        renderVisualization()
    }

    const loadCommands = async (): Promise<void> => {
        ++loadGeneration
        commands = await api.getCommands()
        commandsById = new Map(commands.map((command) => [command.id, command]))
        const previousStatuses = new Map(statusCache)
        statusCache.clear()
        for (const command of commands) {
            if (!hasStatus(command)) continue
            const previousStatus = previousStatuses.get(command.id)
            statusCache.set(
                command.id,
                previousStatus === 'refreshing'
                    ? 'unknown'
                    : previousStatus ?? 'unknown',
            )
        }
        renderVisualization()
    }

    const checkStatusesButton = createButton('Check All Statuses', async () => {
        checkStatusesButton.disabled = true
        try {
            await refreshAllStatuses(loadGeneration)
        } catch (error) {
            alert(
                `Failed to check statuses: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            )
        } finally {
            checkStatusesButton.disabled = false
        }
    })
    toolbar.append(checkStatusesButton)

    toolbar.append(createButton('Add command', async () => {
        const draft = await showCommandDialog('url', commands)
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

    try {
        await loadCommands()
    } catch (error) {
        root.textContent = `Failed to load commands: ${
            error instanceof Error ? error.message : String(error)
        }`
    }
}

document.addEventListener('DOMContentLoaded', () => void main(), false)
