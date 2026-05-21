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
#Substrate,Architecture

LLM dashboard
https://llm-dash.azurewebsites.net/model_insight
#LLM,Dashboard

Arch review process
https://teams.microsoft.com/l/message/19:6987ef3516d94c1e862c6ecd75100f25@thread.skype/1775423220114?tenantId=72f988bf-86f1-41af-91ab-2d7cd011db47&groupId=7cc2bcc3-969b-404a-9de4-6cd1d539eb11&parentMessageId=1775423220114&teamName=Calling%2FMeeting%2FDevices&channelName=Announcements&createdTime=1775423220114

943 admin center
https://admin.microsoft.com/?login_hint=admin@M365CPI32306943.onmicrosoft.com
@Profile 4

T091 admin center
https://admin.microsoft.com/?login_hint=admin@M365MCP81612091.onmicrosoft.com
@Profile 3

`

function openUrl(url: string) {
    return async function() {
        const result = await api.shellRun(url)
        return result
    }
}

function openUrlByChrome(url: string, profile: string) {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    return async function() {
        const result = await api.runCommand(chromePath, [
            `--profile-directory=${profile}`, 
            url])
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

function bookmark(name: string, url: string, description?: string, profile?: string, tags: string[] = []) {
    return {
        name,
        tag: ['bookmark', ...tags],
        description,
        url,
        run: profile ? openUrlByChrome(url, profile) : openUrl(url),
    }
}

function parseBookmarkFromString(str: string) {
    // split bookmarks by paragraph
    const paras = str.split('\n').map(line => line.trim()).join('\n').split('\n\n').map(part => part.trim())
    
    return paras
        .filter(part => part.length > 0)
        .map(part => {
            let name, url, profile, tags: string[] = [], description = ''
            const partLines = part.split('\n')
            for (const [i, line] of partLines.entries()) {
                if (line.startsWith('#')) {
                    // # for tags
                    tags = line.substring(1).split(',').map(t => t.trim())
                } else if (line.startsWith('@')) {
                    // @ for profile
                    profile = line.substring(1).trim()
                } else if (line.startsWith('http')) {
                    // url line
                    url = line.trim()
                } else {
                    // other lines are considered as name and description
                    if (!name) {
                        name = line.trim()
                    } else {
                        description += line.trim() + '\n'
                    }
                }
            }
            if (name && url) {
                return bookmark(name, url, description.trim(), profile, tags)
            }

            return null
        })
        .filter((cmd) => cmd !== null)
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
    {
        name: 'Edit with Code',
        tag: ['editors'],
        description: 'Open current folder in VS Code',
        run: async function() {
            const result = await api.editMySelfWithCode()
            return result
        },
    },
    {
        name: "拦截postMessage消息",
        tag: ['debugging'],
        description: "const h1 = e => console.log('post message: ', e.origin, e.data); window.addEventListener('message', h1, true);",
        run: async function() {
            const code = `const h1 = e => console.log('post message: ', e.origin, e.data); window.addEventListener('message', h1, true);`
            uu.showInDialog('拦截postMessage消息', `在浏览器控制台执行以下代码，可以拦截当前页面的postMessage消息，方便调试<br><br><code>${code}</code>`)
        }
    },
    ...parseBookmarkFromString(allBookmarks)
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
            'Run': async function(command: Command) {
                const result = await command.run()
                console.log('Command result:', result)
            }
        },
        onRowClick: async (item: Command, dataIndex: number) => {
            console.log('Row clicked:', item, dataIndex)
            const result = await uu.callAsyncFunctionWithProgress(() => item.run(), 'Running command...')
            console.log('Command result:', result)
        },

        hideUniformColumns: false
    }))
}

document.addEventListener('DOMContentLoaded', function() {
    main();
}, false);

