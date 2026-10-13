import { api, type CommandConfig, type CommandDraft } from '../api.ts'
import { showOneAuthAccounts } from './components/one-auth-manager.ts'
import * as uu from './uu.ts'

type CommandType = CommandDraft['type']
type CommandStatus = 'unknown' | 'yes' | 'no'

const commandTypes: CommandType[] = [
    'url',
    'terminal',
    'code',
    'message',
    'oneAuth',
    'compound',
]

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
    }
}

async function runCommand(
    command: CommandConfig,
    commandsById: ReadonlyMap<string, CommandConfig>,
): Promise<void> {
    switch (command.type) {
        case 'url':
            if (command.profile) {
                await api.runCommand(
                    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                    [`--profile-directory=${command.profile}`, command.url],
                )
            } else {
                await api.shellRun(command.url)
            }
            return
        case 'terminal':
            await api.runCommandInTerminal(command.command, command.args)
            return
        case 'code': {
            const path = command.path === '%MYSELF%'
                ? await api.getMyselfDir()
                : command.path
            await api.openDirWithCode(path)
            return
        }
        case 'message': {
            const content = document.createElement('div')
            const instruction = document.createElement('p')
            instruction.textContent = command.description ?? ''
            const code = document.createElement('code')
            code.textContent = command.content
            content.append(instruction, code)
            await uu.showInDialog(command.name, content)
            return
        }
        case 'oneAuth':
            await showOneAuthAccounts()
            return
        case 'compound':
            const subCommands = getSubCommands(command, commandsById)
            if (command.mode === 'choose') {
                const choices = subCommands.map((item) =>
                    `${item.name} (${item.type})`
                )
                const selectedLabel = await uu.chooseOne(choices)
                const selectedIndex = choices.indexOf(selectedLabel ?? '')
                if (selectedIndex >= 0) {
                    await runCommand(subCommands[selectedIndex], commandsById)
                }
                return
            }
            for (const subCommand of subCommands) {
                await runCommand(subCommand, commandsById)
            }
    }
}

function hasStatus(command: CommandConfig): boolean {
    return command.type === 'terminal' && command.statusPort !== undefined
}

async function getCommandStatus(
    command: CommandConfig,
): Promise<CommandStatus> {
    if (command.type !== 'terminal' || command.statusPort === undefined) {
        return 'unknown'
    }
    const portInfo = await api.getLocalPortInfo(command.statusPort)
    return portInfo.isOpen ? 'yes' : 'no'
}

function updateStatus(
    element: HTMLElement,
    status: CommandStatus | 'running',
): void {
    if (status === 'running') {
        element.textContent = ''
        element.className = 'loader'
        return
    }
    element.className = ''
    element.textContent = status === 'yes' ? '✅' : status === 'no' ? '❌' : ''
}

async function showCommandDialog(
    type: CommandType,
    commands: CommandConfig[],
    initial?: CommandDraft,
    editingId?: string,
): Promise<CommandDraft | null> {
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
    const statusElements = new Map<string, HTMLElement>()
    let commandsById = new Map<string, CommandConfig>()

    const run = async (command: CommandConfig) => {
        try {
            await runCommand(command, commandsById)
            if (!hasStatus(command)) return
            const element = statusElements.get(command.id)
            if (!element) return
            updateStatus(element, 'running')
            for (let attempt = 0; attempt < 10; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 1000))
                if (await getCommandStatus(command) === 'yes') {
                    updateStatus(element, 'yes')
                    return
                }
            }
            updateStatus(element, 'no')
        } catch (error) {
            alert(
                `Failed to run command: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            )
        }
    }

    const renderCommands = async () => {
        const commands = await api.getCommands()
        commandsById = new Map(commands.map((command) => [command.id, command]))
        const toolbar = document.createElement('div')
        toolbar.className = 'command-toolbar'

        for (const type of commandTypes) {
            toolbar.append(createButton(`Add ${type}`, async () => {
                const draft = await showCommandDialog(type, commands)
                if (!draft) return
                try {
                    await api.addCommand(draft)
                    await renderCommands()
                } catch (error) {
                    alert(
                        `Failed to add command: ${
                            error instanceof Error
                                ? error.message
                                : String(error)
                        }`,
                    )
                }
            }))
        }

        const table = uu.visualizeArray(commands, {
            renderStyles: ['table', 'tile'],
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
                            statusElements.set(item.id, element)
                            if (hasStatus(item)) {
                                void getCommandStatus(item).then((status) =>
                                    updateStatus(element, status)
                                )
                            }
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
                            await renderCommands()
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
                            await renderCommands()
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
                        const element = statusElements.get(item.id)
                        if (element) {
                            updateStatus(
                                element,
                                await getCommandStatus(item),
                            )
                        }
                    }
                }
                return actions
            },
            hideUniformProps: false,
            rawIndexProp: '#',
            stateKey: 'MyEnvCommands',
        })
        root.replaceChildren(toolbar, table)
    }

    try {
        await renderCommands()
    } catch (error) {
        root.textContent = `Failed to load commands: ${
            error instanceof Error ? error.message : String(error)
        }`
    }
}

document.addEventListener('DOMContentLoaded', () => void main(), false)
