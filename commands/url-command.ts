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

    if (/["\r\n]/.test(command.url)) {
        throw new Error('URL must not contain double quotes or line breaks.')
    }

    const output = await new Deno.Command('cmd', {
        // Expand once so URL percent escapes remain literal; disable ! expansion.
        args: ['/d', '/v:off', '/c', 'start', '""', '"%ME_COMMAND_URL%"'],
        env: { ME_COMMAND_URL: command.url },
        windowsRawArguments: true,
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
