import type { CodeCommandConfig } from '../command.ts'

export function runCodeCommand(command: CodeCommandConfig): Promise<void> {
    const path = expandEnvironmentVariables(
        command.path === '%MYSELF%' ? getApplicationDirectory() : command.path,
    )
    new Deno.Command('code.cmd', { args: [path] }).spawn()
    return Promise.resolve()
}

function expandEnvironmentVariables(path: string): string {
    return path.replace(
        /%([^%]+)%/g,
        (_, name) => Deno.env.get(name) ?? `%${name}%`,
    )
}

function getApplicationDirectory(): string {
    const pathname = new URL('../', import.meta.url).pathname
    return pathname.substring(1).replace(/\//g, '\\').replace(/\\$/, '')
}
