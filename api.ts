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

export const api = {
    getNetworkInfo: async function (name: string) {
        return await callAPI(arguments) as NetworkInfo[]
    }
}

export type BackendAPI = typeof api

