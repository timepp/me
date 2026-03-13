import {api} from '../api.ts'
import * as uu from './uu.ts'
import { connectWebSocket } from './websocket-client.ts'
import * as tagger from './tagger.ts'

function openUrl(url: string) {
    return async function() {
        const result = await api.shellRun(url)
        return result
    }
}

// Whether current device status align with the expected status after the command is executed.
type CommandStatus = 'unknown' | 'yes' | 'no'

type Command = {
    name: string,
    tag?: string[],
    description?: string,
    run: () => Promise<string>,
    status?: () => Promise<CommandStatus>
}

function bookmark(name: string, url: string, description?: string): Command {
    return {
        name,
        tag: ['bookmark'],
        description,
        run: openUrl(url)
    }
}

const commands = [
    {
        name: 'Launch SSH proxy',
        tag: [] as string[],
        description: 'Launch an SSH proxy using VM in Azure. The public IP address comes from the VM in `portal.azure.com` @ tosexng',
        run: async function() {
            const result = await api.runCommandInTerminal('ssh', [
                '-v',
                '-i', 'c:\\cloud\\INFO\\cert\\azure_tosexng_proxy_key.pem',
                '-D', '1080', 
                'timepp@52.184.82.147'
            ])
            return result
        },
        status: async function() {
            const portInfo = await api.getLocalPortInfo(1080)
            console.log(`got port info:`, portInfo)
            if (portInfo.isOpen) {
                return 'yes'
            } else {
                return 'no'
            }
        }
    },
    bookmark('CDX: T091', 
        'https://cdx.transform.microsoft.com/dashboard/tenant-details/efc33fab-d188-4c61-bb40-661f3c9fb529', 
        'Open Test Tenant T091'),
    bookmark('Request repo permissions in 1ES', 
        'https://eng.ms/docs/coreai/devdiv/one-engineering-system-1es/1es-colinay/engineering-tenant/1es-permissions-service/perms')
]

function updateStatus(elem: HTMLSpanElement, status: CommandStatus | 'running') {
    console.log('Updating status for command:', elem, status)
    if (status === 'running') {
        elem.textContent = ''
        elem.className = 'loader'
    } else {
        elem.className = ''
        if (status === 'yes') {
            elem.textContent = '✅'
        } else if (status === 'no') {
            elem.textContent = '❌'
        } else {
            elem.textContent = '❓'
        }
    }
}

async function main() {
    // wait for websocket connection ready
    await connectWebSocket()
    document.body.append(uu.visualizeArray(commands, {
        columnProperties: {
            status: {
                formater: function(command) {
                    const element = document.createElement('span')
                    if (command) {
                        command().then((status: CommandStatus) => {
                            updateStatus(element, status)
                        })
                    } else {
                        element.textContent = 'N/A'
                    }
                    return element
                }
            }
        },
        itemActions: {
            'Run': async function(command) {
                const result = await command.run()
                uu.showDialog('Run Result', result)
            }
        },
        hideUniformColumns: false
    }))
}

document.addEventListener('DOMContentLoaded', function() {
    main();
}, false);

