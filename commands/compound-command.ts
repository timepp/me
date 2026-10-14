import type { CompoundCommandConfig } from '../command.ts'
import type {
    CommandExecutionContext,
    CommandExecutionResult,
} from './types.ts'

export async function runCompoundCommand(
    command: CompoundCommandConfig,
    context: CommandExecutionContext,
): Promise<CommandExecutionResult[]> {
    if (command.mode === 'all') {
        const results: CommandExecutionResult[] = []
        for (const id of command.subCommandIds) {
            results.push(...await context.runCommandById(id))
        }
        return results
    }

    const subCommands = command.subCommandIds.map((id) => {
        const subCommand = context.commandsById.get(id)
        if (!subCommand) throw new Error(`Referenced command not found: ${id}`)
        return subCommand
    })
    const choices = subCommands.map((command) =>
        `${command.name} (${command.type})`
    )
    const selected = await context.getUserInput(
        `Choose a command to run from "${command.name}"`,
        choices,
    )
    const index = selected === undefined ? -1 : choices.indexOf(selected)
    return index >= 0 ? await context.runCommandById(subCommands[index].id) : []
}
