import {api} from '../api.ts'
import * as uu from './uu.ts'

function openUrl(url: string) {
    return async function() {
        const result = await api.shellRun(url)
        return result
    }
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
            return result
        }
    },
    {
        name: 'CDX: T091',
        description: 'Open Test Tenant T091',
        run: openUrl('https://cdx.transform.microsoft.com/dashboard/tenant-details/efc33fab-d188-4c61-bb40-661f3c9fb529')
    }
]

async function main() {
    document.body.append(uu.visualizeArray(commands, {
        itemActions: {
            'Run': async function(command) {
                const result = await command.run()
                uu.showDialog('Run Result', result)
            }
        }
    }))
}

document.addEventListener('DOMContentLoaded', function() {
    main();
}, false);

