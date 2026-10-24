import { createClient } from "@timepp/dui/client"
import type {
    CommandDraft,
    CommandExecutionResult,
    CommandStatus,
    CommandWithRunStats,
    GetUserInput,
    OnCommandEvent,
} from './command.ts'
import type { OneAuthInfo } from './lib/oneauth.ts'
import type {
    CommandRunRecord,
    CommandRunSummary,
    OnCommandRunStarted,
} from './command-history-types.ts'
export type {
    CommandRunRecord,
    CommandRunSummary,
    OnCommandRunStarted,
} from './command-history-types.ts'

export type {
    CommandEvent,
    CommandConfig,
    CommandDraft,
    CommandExecutionResult,
    CommandStatus,
    CommandWithRunStats,
    GetUserInput,
    OnCommandEvent,
    TerminalCommandResult,
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
    getCommands(): Promise<CommandWithRunStats[]>
    addCommand(command: CommandDraft): Promise<CommandWithRunStats>
    updateCommand(id: string, command: CommandDraft): Promise<CommandWithRunStats>
    deleteCommand(id: string): Promise<void>
    runConfiguredCommand(
        id: string,
        getUserInput: GetUserInput,
        onCommandEvent?: OnCommandEvent,
        onRunStarted?: OnCommandRunStarted,
    ): Promise<CommandExecutionResult[]>
    getCommandRunHistory(commandId?: string): Promise<CommandRunSummary[]>
    getCommandRun(id: string): Promise<CommandRunRecord>
    getCommandStatus(id: string): Promise<CommandStatus>

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
