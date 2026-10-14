import { createClient } from "@timepp/dui/client"
import type {
    CommandConfig,
    CommandDraft,
    CommandExecutionResult,
    GetUserInput,
} from './command.ts'
import type { OneAuthInfo } from './lib/oneauth.ts'

export type {
    CommandConfig,
    CommandDraft,
    CommandExecutionResult,
    GetUserInput,
} from './command.ts'
export type { OneAuthInfo } from './lib/oneauth.ts'

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

export interface BackendAPI {
    getCommands(): Promise<CommandConfig[]>
    addCommand(command: CommandDraft): Promise<CommandConfig>
    updateCommand(id: string, command: CommandDraft): Promise<CommandConfig>
    deleteCommand(id: string): Promise<void>
    runConfiguredCommand(
        id: string,
        getUserInput: GetUserInput,
    ): Promise<CommandExecutionResult[]>

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
