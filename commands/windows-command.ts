import type {
    FileContentCommandConfig,
    JunctionCommandConfig,
    PathEntryCommandConfig,
    PowerShellCommandConfig,
    RegistryCommandConfig,
    ScheduledTaskCommandConfig,
    ShortcutCommandConfig,
} from '../command.ts'
import {
    type CommandStatus,
    satisfied,
    statusError,
    unknown,
    unsatisfied,
} from './status.ts'

type WindowsCommand =
    | RegistryCommandConfig
    | PathEntryCommandConfig
    | ScheduledTaskCommandConfig
    | ShortcutCommandConfig
    | JunctionCommandConfig
    | FileContentCommandConfig
    | PowerShellCommandConfig

export async function runWindowsCommand(
    command: WindowsCommand,
): Promise<void> {
    const script = applyScript(command)
    if (command.elevated) {
        await runElevatedPowerShell(script)
    } else {
        await runPowerShell(script)
    }
}

export async function getWindowsCommandStatus(
    command: WindowsCommand,
): Promise<CommandStatus> {
    const script = statusScript(command)
    if (!script) return unknown('This command does not provide a status check')
    try {
        const output = await runPowerShell(script)
        return output.trim().toLowerCase() === 'true'
            ? satisfied()
            : unsatisfied(output.trim() || undefined)
    } catch (error) {
        return statusError(error)
    }
}

function applyScript(command: WindowsCommand): string {
    switch (command.type) {
        case 'registry':
            return command.values.map((value) => {
                const name = value.name ?? ''
                const type = typeof value.value === 'number'
                    ? 'DWord'
                    : Array.isArray(value.value)
                    ? 'MultiString'
                    : 'String'
                return [
                    `$path = ${ps(registryPath(value.key))}`,
                    `New-Item -Path $path -Force | Out-Null`,
                    name
                        ? `New-ItemProperty -Path $path -Name ${
                            ps(name)
                        } -PropertyType ${type} -Value ${
                            psValue(value.value)
                        } -Force | Out-Null`
                        : `Set-Item -LiteralPath $path -Value ${
                            psValue(value.value)
                        }`,
                ].join('; ')
            }).join('\n')
        case 'pathEntry':
            return [
                `$entries = @(${command.entries.map(ps).join(', ')})`,
                `$current = [Environment]::GetEnvironmentVariable('Path', 'Machine')`,
                `$parts = @($current -split ';' | Where-Object { $_ })`,
                `foreach ($entry in $entries) { if ($parts -notcontains $entry) { $parts += $entry } }`,
                `[Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'Machine')`,
            ].join('; ')
        case 'scheduledTask': {
            const executable = expandEnvironmentVariables(command.executable)
            const args = command.args.map(expandEnvironmentVariables).join(' ')
            return [
                `$action = New-ScheduledTaskAction -Execute ${ps(executable)}${
                    args ? ` -Argument ${ps(args)}` : ''
                }`,
                `$trigger = New-ScheduledTaskTrigger -AtLogOn`,
                `$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive${
                    command.runLevel === 'highest' ? ' -RunLevel Highest' : ''
                }`,
                `Register-ScheduledTask -TaskName ${
                    ps(command.taskName)
                } -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null`,
            ].join('; ')
        }
        case 'shortcut':
            return [
                `$path = [Environment]::ExpandEnvironmentVariables(${
                    ps(command.path)
                })`,
                `$target = [Environment]::ExpandEnvironmentVariables(${
                    ps(command.target)
                })`,
                `New-Item -ItemType Directory -Path (Split-Path $path) -Force | Out-Null`,
                `$shell = New-Object -ComObject WScript.Shell`,
                `$shortcut = $shell.CreateShortcut($path)`,
                `$shortcut.TargetPath = $target`,
                command.args
                    ? `$shortcut.Arguments = ${
                        ps(expandEnvironmentVariables(command.args))
                    }`
                    : '',
                `$shortcut.Save()`,
            ].filter(Boolean).join('; ')
        case 'junction':
            return [
                `$path = [Environment]::ExpandEnvironmentVariables(${
                    ps(command.path)
                })`,
                `$target = [Environment]::ExpandEnvironmentVariables(${
                    ps(command.target)
                })`,
                `if (-not (Test-Path -LiteralPath $target)) { throw "Target does not exist: $target" }`,
                `if (Test-Path -LiteralPath $path) { throw "Path already exists: $path" }`,
                `New-Item -ItemType Junction -Path $path -Target $target | Out-Null`,
            ].join('; ')
        case 'fileContent':
            return [
                `$path = [Environment]::ExpandEnvironmentVariables(${
                    ps(command.path)
                })`,
                `$content = ${ps(command.content)}`,
                `if (-not (Test-Path -LiteralPath $path)) { New-Item -ItemType File -Path $path -Force | Out-Null }`,
                `if (-not (Select-String -LiteralPath $path -SimpleMatch ${
                    ps(command.marker)
                } -Quiet)) { Add-Content -LiteralPath $path -Value $content }`,
            ].join('; ')
        case 'powerShell':
            return command.applyScript
    }
}

function statusScript(command: WindowsCommand): string | undefined {
    switch (command.type) {
        case 'registry':
            return [
                `$ok = $true`,
                ...command.values.map((value) => {
                    const path = registryPath(value.key)
                    const name = value.name ?? ''
                    const read = name
                        ? `(Get-ItemProperty -LiteralPath ${ps(path)} -Name ${
                            ps(name)
                        } -ErrorAction SilentlyContinue).${psProperty(name)}`
                        : `(Get-Item -LiteralPath ${
                            ps(path)
                        } -ErrorAction SilentlyContinue).GetValue('')`
                    return `$actual = ${read}; if (($actual | ConvertTo-Json -Compress) -ne (${
                        psValue(value.value)
                    } | ConvertTo-Json -Compress)) { $ok = $false }`
                }),
                `Write-Output $ok`,
            ].join('; ')
        case 'pathEntry':
            return [
                `$parts = @([Environment]::GetEnvironmentVariable('Path', 'Machine') -split ';')`,
                `$ok = $true`,
                ...command.entries.map((entry) =>
                    `if ($parts -notcontains ${ps(entry)}) { $ok = $false }`
                ),
                `Write-Output $ok`,
            ].join('; ')
        case 'scheduledTask':
            return `Write-Output ([bool](Get-ScheduledTask -TaskName ${
                ps(command.taskName)
            } -ErrorAction SilentlyContinue))`
        case 'shortcut':
            return `Write-Output (Test-Path -LiteralPath ([Environment]::ExpandEnvironmentVariables(${
                ps(command.path)
            })))`
        case 'junction':
            return [
                `$item = Get-Item -LiteralPath ([Environment]::ExpandEnvironmentVariables(${
                    ps(command.path)
                })) -ErrorAction SilentlyContinue`,
                `$target = [Environment]::ExpandEnvironmentVariables(${
                    ps(command.target)
                })`,
                `Write-Output ([bool]($item -and $item.LinkType -eq 'Junction' -and $item.Target -contains $target))`,
            ].join('; ')
        case 'fileContent':
            return `Write-Output ([bool](Test-Path -LiteralPath ([Environment]::ExpandEnvironmentVariables(${
                ps(command.path)
            }))) -and [bool](Select-String -LiteralPath ([Environment]::ExpandEnvironmentVariables(${
                ps(command.path)
            })) -SimpleMatch ${ps(command.marker)} -Quiet))`
        case 'powerShell':
            return command.statusScript
    }
}

async function runPowerShell(script: string): Promise<string> {
    const output = await new Deno.Command('powershell.exe', {
        args: ['-NoProfile', '-NonInteractive', '-Command', script],
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    if (!output.success) {
        throw new Error(new TextDecoder().decode(output.stderr).trim())
    }
    return new TextDecoder().decode(output.stdout).trim()
}

async function runElevatedPowerShell(script: string): Promise<void> {
    const encoded = btoa(
        String.fromCharCode(
            ...new Uint8Array(new TextEncoder().encode(script)),
        ),
    )
    await runPowerShell(
        `$bytes = [Convert]::FromBase64String(${ps(encoded)}); ` +
            `$script = [Text.Encoding]::UTF8.GetString($bytes); ` +
            `$process = Start-Process powershell.exe -Verb RunAs -Wait -PassThru ` +
            `-ArgumentList @('-NoProfile','-NonInteractive','-Command',$script); ` +
            `if ($process.ExitCode -ne 0) { throw "Elevated command failed with exit code $($process.ExitCode)" }`,
    )
}

function registryPath(key: string): string {
    const roots: Record<string, string> = {
        HKCU: 'Registry::HKEY_CURRENT_USER',
        HKLM: 'Registry::HKEY_LOCAL_MACHINE',
        HKCR: 'Registry::HKEY_CLASSES_ROOT',
    }
    const [root, ...rest] = key.split('\\')
    if (!roots[root]) throw new Error(`Unsupported registry root: ${root}`)
    return `${roots[root]}\\${rest.join('\\')}`
}

function ps(value: string): string {
    return `'${value.replaceAll("'", "''")}'`
}

function psValue(value: string | number | string[]): string {
    if (typeof value === 'number') return String(value)
    if (Array.isArray(value)) return `@(${value.map(ps).join(', ')})`
    return ps(expandEnvironmentVariables(value))
}

function psProperty(name: string): string {
    return name ? `'${name.replaceAll("'", "''")}'` : "'(default)'"
}

function expandEnvironmentVariables(value: string): string {
    return value.replace(
        /%([^%]+)%/g,
        (_, name) => Deno.env.get(name) ?? `%${name}%`,
    )
}
