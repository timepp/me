import * as uu from '../uu.ts'
import { api, type OneAuthInfo } from '../../api.ts'

export async function showOneAuthAccounts(
    initialAccounts: OneAuthInfo[],
    title = 'OneAuth Accounts',
) {
    const content = document.createElement('div')

    function renderAccounts(accounts: OneAuthInfo[]) {
        const table = uu.visualizeArray(accounts, {
            renderStyles: ['table', 'tile'],
            stateKey: 'OneAuthAccounts',
            itemActions: {
                Delete: async function (item: { id: string }) {
                    const confirmed = confirm(
                        `Are you sure you want to delete the OneAuth account with ID: ${item.id}?`,
                    )
                    if (confirmed) {
                        const result = await api.removeOneAuthAccount(item.id)
                        if (result) {
                            alert('Account deleted successfully')
                            renderAccounts(await api.getOneAuthAccounts())
                        } else {
                            alert('Failed to delete account')
                        }
                    }
                },
            },
        })
        content.replaceChildren(table)
    }

    renderAccounts(initialAccounts)
    await uu.showInDialog(title, content)
}
