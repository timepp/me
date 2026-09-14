import {api} from '../api.ts'
import * as uu from './uu.ts'

const allBookmarks = `
CDX: Dashboard
https://cdx.transform.microsoft.com/dashboard?tab=mytenants
Open Test Tenants

Request repo permissions in 1ES
https://eng.ms/docs/initiatives/1es-permissions-service/perms/office/oe

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

486 admin center
https://admin.microsoft.com/?login_hint=admin@M365CPI00209486.onmicrosoft.com
@Profile 2

Compliance Deck
https://microsoft-my.sharepoint-df.com/:p:/p/junhuitong/cQptgGBJtdvrTrsCUxGDkQfzEgUCxy_QibHmOLKWqV0lMsnGCw
#Compliance,Working

Compliance Doc
https://microsoft-my.sharepoint-df.com/:w:/p/junhuitong/cQrqW4FCU2BtQ4HSLCGNca1EEgUCY6duMDJZDe0Sg__Bkz0WVw
#Compliance,Working

FSL Tech Deck
https://microsoft.sharepoint-df.com/:p:/s/M365CoreSearchExtensibilityTeam/cQrgokjJnLdUQ723A7CvYxpsEgUCOb7oDIyNNIM_BA-XAHCzkA?isSPOFile=1&ovuser=72f988bf-86f1-41af-91ab-2d7cd011db47%2Cjunhuitong%40microsoft.com&wdExp=TEAMS-TREATMENT&web=1&clickparams=eyJBcHBOYW1lIjoiVGVhbXMtRGVza3RvcCIsIkFwcFZlcnNpb24iOiI0OS8yNjA3MTYxNjAxMSJ9
#Substrate,Knowledge

Arch Dashboard
https://domoreexp.visualstudio.com/MSTeams/_dashboards/dashboard/0bb414f5-32ba-4056-9563-a7554a90c757

Arch Query
https://domoreexp.visualstudio.com/MSTeams/_queries/query/c84834ef-601b-4cf8-b6e6-6c8c4caad9ec/

Arch Template
https://domoreexp.visualstudio.com/MSTeams/_workitems/edit/5598914

M365 Monitoring Wiki
https://o365exchange.visualstudio.com/O365%20Core/_wiki/wikis/M365%20Passive%20Monitoring/490289/sop-access-passive-monitoring-kusto-databases

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

interface Command {
    name: string
    tag?: string[]
    description?: string
    run(): Promise<string | void>
    status?(): Promise<CommandStatus>
}

interface BookmarkCommand extends Command {
    url: string
}

interface CompoundCommand extends Command {
    subCommands: Command[]
}

function compoundCommand(name: string, subCommands: Command[], description?: string): CompoundCommand {
    return {
        name,
        tag: ['compound'],
        description,
        subCommands,
        run: async function() {
            for (const cmd of subCommands) {
                const result = await cmd.run()
                console.log(`Command ${cmd.name} executed with result:`, result)
            }
        }
    }
}

function bookmark(name: string, url: string, description?: string, profile?: string, tags: string[] = []): BookmarkCommand {
    return {
        name,
        tag: ['bookmark', ...tags],
        description,
        url,
        run: profile ? openUrlByChrome(url, profile) : openUrl(url),
    }
}

function codeLink(dir: string): Command {
    return {
        name: `Open '${dir}'`,
        tag: ['code'],
        description: `Open ${dir} in VS Code`,
        run: async function() {
            const result = await api.openDirWithCode(dir)
            return result
        }
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

async function getCommands()
{
    const myDir = await api.getMyselfDir()
    const bookmarks = parseBookmarkFromString(allBookmarks)
    const commands = [
        {
            name: 'Launch SSH proxy',
            description: 'Launch an SSH proxy using VM in Azure. The public IP address comes from the VM in `portal.azure.com` @ tosexng',
            run: async function () {
                const result = await api.runCommandInTerminal('ssh', [
                    '-v',
                    '-i', 'c:\\cloud\\INFO\\cert\\azure_tosexng_proxy_key.pem',
                    '-D', '1080',
                    'timepp@52.184.82.147'
                ])
                console.log(result)
                // check port within 30 seconds
            },
            status: async function () {
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
            name: "拦截postMessage消息",
            tag: ['debugging'],
            description: "const h1 = e => console.log('post message: ', e.origin, e.data); window.addEventListener('message', h1, true);",
            run: async function () {
                const code = `const h1 = e => console.log('post message: ', e.origin, e.data); window.addEventListener('message', h1, true);`
                uu.showInDialog('拦截postMessage消息', `在浏览器控制台执行以下代码，可以拦截当前页面的postMessage消息，方便调试<br><br><code>${code}</code>`)
            }
        },
        ...bookmarks,
        codeLink('%OneDrive%\\Arch'),
        codeLink(myDir),
        codeLink('%OneDriveConsumer%')
    ] satisfies Command[]
    const getCommand = (name: string): Command => {
        const command = commands.find(cmd => cmd.name === name)
        if (!command) {
            throw new Error(`Command not found: ${name}`)
        }
        return command
    }
    const archSpace = compoundCommand('Arch Space', [
        getCommand('Arch Dashboard'),
        getCommand('Arch Query'),
        getCommand('Arch Template')
    ], 'Open Arch Spaces')
    commands.push(archSpace)
    return commands
}


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
    uu.enableFontAwesome()

    const commands = await getCommands()

    const statusElements: Record<string, HTMLElement> = {}
    const getElement = (item: Command) => statusElements[item.name]
    const setElement = (item: Command, element: HTMLElement) => statusElements[item.name] = element
    const run = async (item: Command) => {
        const result = await item.run()
        if (item.status) {
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
        }
    }
    document.body.append(uu.visualizeArray(commands, {
        renderStyles: ['table', 'tile'],
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
            },
            onItemClick: async function(item, index) {
                run(item)
                return true
            }
        },
        itemActions: item => {
            const actions: uu.ItemActions = {
                'Run': async function(item: Command) {
                    await run(item)
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
        stateKey: 'MyEnv'
    }))
}

document.addEventListener('DOMContentLoaded', function() {
    main();
}, false);

