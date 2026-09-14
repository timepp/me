import { createClient } from "@timepp/dui/client"

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
    getNetworkInfo(name: string): Promise<NetworkInfo[]>
    runCommand(command: string, params: string[]): Promise<string>
    runCommandInTerminal(command: string, params: string[]): Promise<string>
    shellRun(command: string): Promise<string>
    runCommandAndCaptureOutput(command: string, params: string[]): Promise<string>
    getLocalPortInfo(port: number): Promise<PortInfo>
    getMyselfDir(): Promise<string>
    openDirWithCode(dir: string): Promise<string>
    editMySelfWithCode(): Promise<string>
}

export const api = createClient<BackendAPI>()