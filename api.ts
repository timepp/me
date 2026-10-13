import { createClient } from "@timepp/dui/client"
import type { CommandConfig, CommandDraft } from './command.ts'

export type { CommandConfig, CommandDraft } from './command.ts'

export type NetworkInfo = {
    name: string;
    family: "IPv4" | "IPv6";
    address: string;
    netmask: string;
    scopeid: number | null;
    cidr: string;
    mac: string;
}

export type PortInfo = {
    isOpen: boolean;
    processes: Array<{
        pid: number;
        name: string;
        protocol: string;
        state: string;
    }>;
}

export type OneAuthInfo = {
    id: string
    [key: string]: any
}

export interface BackendAPI {
    getCommands(): Promise<CommandConfig[]>
    addCommand(command: CommandDraft): Promise<CommandConfig>
    updateCommand(id: string, command: CommandDraft): Promise<CommandConfig>
    deleteCommand(id: string): Promise<void>

    getNetworkInfo(name: string): Promise<NetworkInfo[]>
    runCommand(command: string, params: string[]): Promise<string>
    runCommandInTerminal(command: string, params: string[]): Promise<string>
    shellRun(command: string): Promise<string>
    runCommandAndCaptureOutput(command: string, params: string[]): Promise<string>
    getLocalPortInfo(port: number): Promise<PortInfo>
    getMyselfDir(): Promise<string>
    openDirWithCode(dir: string): Promise<string>
    editMySelfWithCode(): Promise<string>

    getOneAuthAccounts(): Promise<OneAuthInfo[]>
    removeOneAuthAccount(id: string): Promise<boolean>
}

export const api = createClient<BackendAPI>()
