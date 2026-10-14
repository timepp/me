import type { UrlCommandConfig } from '../command.ts'

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

export async function runUrlCommand(
    command: UrlCommandConfig,
): Promise<void> {
    if (command.profile) {
        new Deno.Command(chromePath, {
            args: [`--profile-directory=${command.profile}`, command.url],
        }).spawn()
        return
    }

    const output = await new Deno.Command('cmd', {
        args: ['/c', 'start', '', command.url],
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    if (!output.success) {
        throw new Error(
            `Failed to open URL "${command.url}": ${
                new TextDecoder().decode(output.stderr).trim()
            }`,
        )
    }
}
