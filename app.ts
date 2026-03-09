import { parseArgs } from "jsr:@std/cli@0.224.7/parse-args"
import { apiImpl } from './api-impl.ts'
import * as denoUI from "jsr:@timepp/dui@0.1.11"

const args = parseArgs(Deno.args)
const release = args.release || !import.meta.url.startsWith('file://')
const memoryAssets = release? (await import('./release-assets.ts')).assets : {}

await denoUI.startDenoUI({
    appName: 'My Environment',
    frontendRoot: 'frontend',
    appMode: true,
    apiImpl,
    release,
    memoryAssets
})
