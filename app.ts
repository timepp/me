import { parseArgs } from "jsr:@std/cli@0.224.7/parse-args"
import { apiImpl } from './api-impl.ts'
import { startDenoUI } from "@timepp/dui"

const args = parseArgs(Deno.args)
const release = args.release || !import.meta.url.startsWith('file://')
const memoryAssets = release? (await import('./release-assets.ts')).assets : {}
await startDenoUI({
    appName: 'My Environment',
    ui: 'frontend/index.html',
    appMode: args.appMode,
    api: apiImpl,
    memoryAssets
})
