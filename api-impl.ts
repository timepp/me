// deno-lint-ignore-file require-await
import { BackendAPI } from './api.ts'

export const apiImpl: BackendAPI = {
    getNetworkInfo: async function (name: string) {
        const ni = Deno.networkInterfaces()
        return ni.filter(n => !name || n.name === name)
    },
    runCommandInTerminal: async function (command: string, params: string[]) {
        // Use 'start' to open a new window, then 'cmd /k' to keep it open after command completes
        const fullCommand = [command, ...params].join(' ')
        const cmd = new Deno.Command('cmd', {
            args: ['/c', 'start', 'cmd', '/k', fullCommand],
        })
        cmd.spawn()
        return `Command "${command} ${params.join(' ')}" executed in new terminal window.`
    },
    shellRun: async function (command: string) {
        // Behave as executing in "Run" dialog
        // Uses 'cmd /c start' to open URLs, files, or run programs with their default associations
        try {
            const cmd = new Deno.Command('cmd', {
                args: ['/c', 'start', '', command],
                stdout: 'piped',
                stderr: 'piped',
            })
            
            const output = await cmd.output()
            
            if (output.success) {
                return `Successfully executed: ${command}`
            } else {
                const errorText = new TextDecoder().decode(output.stderr)
                return `Failed to execute: ${command}. Error: ${errorText}`
            }
        } catch (error) {
            return `Error executing command: ${error instanceof Error ? error.message : String(error)}`
        }
    },
    runCommandAndCaptureOutput: async function (command: string, params: string[]) {
        // TODO
        return ""
    },
    getLocalPortInfo: async function (port: number) {
        const processes: Array<{ pid: number; name: string; protocol: string; state: string }> = []
        
        try {
            // Use netstat to find processes using the port
            const netstatCmd = new Deno.Command('netstat', {
                args: ['-ano'],
                stdout: 'piped',
                stderr: 'piped',
            })
            const netstatOutput = await netstatCmd.output()
            const netstatText = new TextDecoder().decode(netstatOutput.stdout)
            
            // Parse netstat output to find PIDs
            const lines = netstatText.split('\n')
            const pidSet = new Set<number>()
            
            for (const line of lines) {
                if (line.includes(`:${port} `) || line.includes(`:${port}\t`)) {
                    const parts = line.trim().split(/\s+/)
                    if (parts.length >= 5) {
                        const protocol = parts[0]
                        const state = parts[3] || 'LISTENING'
                        const pid = parseInt(parts[4])
                        
                        if (!isNaN(pid)) {
                            pidSet.add(pid)
                            
                            // Get process name for this PID
                            const tasklistCmd = new Deno.Command('tasklist', {
                                args: ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
                                stdout: 'piped',
                                stderr: 'piped',
                            })
                            const tasklistOutput = await tasklistCmd.output()
                            const tasklistText = new TextDecoder().decode(tasklistOutput.stdout)
                            
                            // Parse CSV output: "processname.exe","1234","Console","1","12,345 K"
                            const match = tasklistText.match(/"([^"]+)"/)
                            const processName = match ? match[1] : 'Unknown'
                            
                            processes.push({
                                pid,
                                name: processName,
                                protocol,
                                state,
                            })
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error getting port info:', error)
        }
        
        return {
            isOpen: processes.length > 0,
            processes,
        }
    }
}

if (import.meta.main) {
    // For testing purposes, you can call the API methods here

    console.log(await apiImpl.getLocalPortInfo(1080))
}