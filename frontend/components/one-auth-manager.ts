import * as uu from '../uu.ts'
import { api } from '../../api.ts'

export async function showOneAuthAccounts() {
    const content = document.createElement('div')

    async function refreshAccounts() {
        const accounts = await api.getOneAuthAccounts()
        const table = uu.visualizeArray(accounts, {
            renderStyles: ['table', 'tile'],
            stateKey: 'OneAuthAccounts',
            itemActions: {
                Delete: async function(item: { id: string }) {
                    const confirmed = confirm(`Are you sure you want to delete the OneAuth account with ID: ${item.id}?`)
                    if (confirmed) {
                        const result = await api.removeOneAuthAccount(item.id)
                        if (result) {
                            alert('Account deleted successfully')
                            await refreshAccounts()
                        } else {
                            alert('Failed to delete account')
                        }
                    }
                }
            }
        })
        content.replaceChildren(table)
    }

    await refreshAccounts()
    uu.showInDialog('OneAuth Accounts', content)
}

