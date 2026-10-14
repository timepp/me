import type {
    CommandConfig,
    CommandExecutionResult,
    GetUserInput,
    OneAuthInfo,
} from './api.ts'
import { apiImpl } from './api-impl.ts'

export function resolveExactCommandId(
    input: string,
    commands: Pick<CommandConfig, 'id' | 'name'>[],
): string {
    const normalizedInput = input.trim().toLowerCase()
    const match = commands.find((command) =>
        command.id.toLowerCase() === normalizedInput
    )
    if (!match) throw new Error(`Command ID not found: ${input}`)
    return match.id
}

export function filterCommandsByName(
    filter: string,
    commands: CommandConfig[],
): CommandConfig[] {
    const normalizedFilter = filter.trim().toLowerCase()
    return commands.filter((command) =>
        command.name.toLowerCase().includes(normalizedFilter)
    )
}

export function resolveCommandSelection(
    input: string,
    commands: CommandConfig[],
): CommandConfig {
    const index = Number(input) - 1
    if (
        !Number.isInteger(index) ||
        index < 0 ||
        commands[index] === undefined
    ) {
        throw new Error(`Invalid command selection: ${input}`)
    }
    return commands[index]
}

export function summarizeOneAuthAccounts(accounts: OneAuthInfo[]) {
    return accounts.map((account, index) => ({
        '#': index + 1,
        account: firstString(
            account,
            ['name', 'username', 'email', 'userName', 'displayName'],
        ) ?? '',
        id: account.id,
    }))
}

function firstString(
    value: OneAuthInfo,
    keys: string[],
): string | undefined {
    for (const key of keys) {
        if (typeof value[key] === 'string' && value[key].trim()) {
            return value[key].trim()
        }
    }
    return undefined
}

const getUserInput: GetUserInput = (
    topic,
    choices,
    allowFreeString,
) => {
    console.log(topic)
    choices?.forEach((choice, index) =>
        console.log(`${index + 1}. ${choice}`)
    )

    const answer = prompt(
        choices?.length
            ? 'Enter a choice number or value:'
            : 'Enter a value:',
    )?.trim()
    if (!answer) return Promise.resolve(undefined)

    if (choices?.length) {
        const selectedIndex = Number(answer) - 1
        if (
            Number.isInteger(selectedIndex) &&
            choices[selectedIndex] !== undefined
        ) {
            return Promise.resolve(choices[selectedIndex])
        }
        if (choices.includes(answer)) return Promise.resolve(answer)
        if (!allowFreeString) throw new Error(`Invalid choice: ${answer}`)
    }
    return Promise.resolve(answer)
}

function showCommandResult(result: CommandExecutionResult): void {
    switch (result.type) {
        case 'message':
            console.log(`\n${result.title}`)
            if (result.description) console.log(result.description)
            console.log(result.content)
            return
        case 'oneAuth':
            console.log(`\n${result.title}`)
            console.table(summarizeOneAuthAccounts(result.accounts))
    }
}

function listCommands(commands: CommandConfig[]): void {
    console.table(
        commands.map(({ id, name, type }) => ({ id, name, type })),
    )
}

function showInlineCommands(commands: CommandConfig[]): void {
    const reset = '\x1b[0m'
    console.log(
        commands.map((command, index) => {
            const color = `\x1b[38;5;${16 + (index * 37) % 216}m`
            return `${color}${index + 1}. ${command.name}${reset}`
        }).join('  '),
    )
}

async function executeCommand(commandId: string): Promise<void> {
    const results = await apiImpl.runConfiguredCommand(commandId, getUserInput)
    results.forEach(showCommandResult)
}

async function runInteractive(commands: CommandConfig[]): Promise<void> {
    listCommands(commands)
    while (true) {
        const filter = prompt('Filter commands by name:')?.trim()
        if (filter === undefined) return
        if (!filter) continue

        const matches = filterCommandsByName(filter, commands)
        if (matches.length === 0) {
            console.log(`No commands found for: ${filter}`)
            continue
        }

        if (matches.length === 1) {
            try {
                await executeCommand(matches[0].id)
            } catch (error) {
                console.error(error)
            }
            continue
        }

        showInlineCommands(matches)
        const selection = prompt('Enter the command number:')?.trim()
        if (!selection) continue
        try {
            await executeCommand(resolveCommandSelection(selection, matches).id)
        } catch (error) {
            console.error(error)
        }
    }
}

export async function runCli(args: string[]): Promise<void> {
    const commands = await apiImpl.getCommands()
    if (args.length === 0) {
        await runInteractive(commands)
        return
    }

    switch (args[0]) {
        case '--list':
            if (args.length !== 1) {
                throw new Error('--list does not accept additional arguments')
            }
            listCommands(commands)
            return
        case '--run':
            if (args.length !== 2) {
                throw new Error('Usage: deno run -A cli.ts --run <exact-id>')
            }
            await executeCommand(resolveExactCommandId(args[1], commands))
            return
        default:
            throw new Error(
                `Unknown argument: ${args[0]}. Use --list or --run <exact-id>.`,
            )
    }
}

if (import.meta.main) await runCli(Deno.args)
