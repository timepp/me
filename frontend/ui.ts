import {api} from '../api.ts'
import * as uu from './uu.ts'
import { connectWebSocket } from './websocket-client.ts'
import * as tagger from './tagger.ts'

const allBookmarks = `
CDX: T091
https://cdx.transform.microsoft.com/dashboard/tenant-details/efc33fab-d188-4c61-bb40-661f3c9fb529
Open Test Tenant T091

Request repo permissions in 1ES
https://eng.ms/docs/coreai/devdiv/one-engineering-system-1es/1es-colinay/engineering-tenant/1es-permissions-service/perms

Inspect Graph Request
https://aka.ms/graphlogs

DPS playground
https://m365dp.azurewebsites.net/

CES playground
https://cesplayground.azurewebsites.net/

Office Graph Architecture
https://microsoft-my.sharepoint-df.com/:p:/p/simonhul/cQq2VwqJVaZbQawqNzL9uyHZEgUCajSUiP_LrY0G4chT3-4l3Q
#Substrate, #Architecture
`

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

function bookmark(name: string, url: string, description?: string, tags: string[] = []) {
    return {
        name,
        tag: ['bookmark', ...tags],
        description,
        url,
        run: openUrl(url),
    }
}

function parseBookmarkFromString(str: string) {
    // split bookmarks by paragraph
    const paras = str.split('\n').map(line => line.trim()).join('\n').split('\n\n').map(part => part.trim())
    
    return paras
        .filter(part => part.length > 0)
        .map(part => {
            const partLines = part.split('\n')
            if (partLines.length >= 2) {
                const [name, url, ...rest] = partLines
                const tagsMatch = rest[0]?.match(/#\w+/g)
                const tags = tagsMatch ? tagsMatch.map(t => t.substring(1)) : []
                const descStart = tagsMatch ? 1 : 0
                const description = rest.slice(descStart).join('\n').trim() || undefined
                return bookmark(name, url, description, tags)
            }
            return null
        })
        .filter((cmd) => cmd !== null)
}

const commands = [
    {
        name: 'Launch SSH proxy',
        description: 'Launch an SSH proxy using VM in Azure. The public IP address comes from the VM in `portal.azure.com` @ tosexng',
        run: async function() {
            const result = await api.runCommandInTerminal('ssh', [
                '-v',
                '-i', 'c:\\cloud\\INFO\\cert\\azure_tosexng_proxy_key.pem',
                '-D', '1080', 
                'timepp@52.184.82.147'
            ])
            console.log(result)
            // check port within 30 seconds
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
    ...parseBookmarkFromString(allBookmarks)
] as Command[]

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
            elem.textContent = ''
        }
    }
}

async function main() {
    // wait for websocket connection ready
    await connectWebSocket()
    uu.enableFontAwesome()

    const statusElements: Record<string, HTMLElement> = {}
    const getElement = (item: Command) => statusElements[item.name]
    const setElement = (item: Command, element: HTMLElement) => statusElements[item.name] = element
    document.body.append(uu.visualizeArray(commands, {
        renderOption: {
            propOptions: {
                status: {
                    formatter: function(item, prop, index) {
                        let element = getElement(item)
                        if (element) {
                            return element
                        }
                        element = uu.createElement(null, 'span', [], 'N/A')
                        setElement(item, element)
                        if (item.status) {
                            item.status().then((status: CommandStatus) => {
                                updateStatus(element, status)
                            })
                        }
                        return element
                    }
                }
            }
        },
        itemActions: item => {
            const actions: uu.ItemActions = {
                'Run': async function(item: Command) {
                    const result = await item.run()
                    updateStatus(getElement(item), 'running')
                    // we need to keep check item status until it's ok
                    for (let i = 0; i < 10; i++) {
                        await new Promise(r => setTimeout(r, 1000))
                        const status = await item.status?.()
                        if (status === 'yes') {
                            updateStatus(getElement(item), 'yes')
                            return
                        }
                    }
                    // if after retrying for a while, the status is still not yes, we set it to no
                    updateStatus(getElement(item), 'no')
                },
            }
            if (item.status) {
                actions['Refresh Status'] = async function(item: Command) {
                    updateStatus(getElement(item), 'unknown')
                    const status = await item.status!()
                    updateStatus(getElement(item), status)
                }
            }
            return actions
        },
        hideUniformProps: false,
        rawIndexProp: '#',
        stateKey: 'MyEnv',
        wallRenderOption: {
            imageUrl: (item, index) => {
                const images = [
                    'https://th.bing.com/th/id/OIP.C-0rSiRmGRZnYUS0W_irLgAAAA?&rs=1&pid=ImgDetMain&o=7&rm=3',
                    'https://64.media.tumblr.com/90696478bc0bd478eb8a42af40f1c8c6/b168c0193a7aeef4-46/s1280x1920/e92c046d3c9d755d56e53290b029d719d4005f0c.jpg'
                ]
                return images[index % images.length]
            }
        }
    }))
}

document.addEventListener('DOMContentLoaded', function() {
    main();
}, false);

