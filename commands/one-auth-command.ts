import type { OneAuthCommandConfig } from '../command.ts'
import { getOneAuthAccounts } from '../lib/oneauth.ts'
import type { OneAuthCommandResult } from './types.ts'

export async function runOneAuthCommand(
    command: OneAuthCommandConfig,
): Promise<OneAuthCommandResult> {
    return {
        type: 'oneAuth',
        title: command.name,
        accounts: await getOneAuthAccounts(),
    }
}
