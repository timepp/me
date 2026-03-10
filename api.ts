// deno-lint-ignore-file no-unused-vars
import { callAPI } from './frontend/websocket-client.ts'

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

export const api = {
    getNetworkInfo: async function (name: string) {
        return await callAPI(arguments) as NetworkInfo[]
    },
    runCommandAndCaptureOutput: async function (command: string, params: string[]) {
        return await callAPI(arguments) as string
    },
    runCommandInTerminal: async function (command: string, params: string[]) {
        return await callAPI(arguments) as string
    },
    getLocalPortInfo: async function (port: number) {
        return await callAPI(arguments) as PortInfo
    },
    shellRun: async function (command: string) {
        return await callAPI(arguments) as string
    }
}

export type BackendAPI = typeof api

