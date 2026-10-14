/// read oneauth accounts from %LOCALAPPDATA%\Microsoft\OneAuth\accounts
/// each file represents an account

export type OneAuthInfo = {
    id: string
    [key: string]: unknown
}

export async function getOneAuthAccounts(): Promise<OneAuthInfo[]> {
    const accountsDir = Deno.env.get('LOCALAPPDATA') +
        '\\Microsoft\\OneAuth\\accounts'
    const accounts: OneAuthInfo[] = []
    for await (const entry of Deno.readDir(accountsDir)) {
        if (entry.isFile) {
            const id = entry.name
            const filePath = `${accountsDir}\\${id}`
            try {
                const content = await Deno.readTextFile(filePath)
                const obj = JSON.parse(content)
                accounts.push(obj)
            } catch (error) {
                console.error(
                    `Failed to read or parse account file ${filePath}:`,
                    error,
                )
            }
        }
    }

    return accounts
}

export async function removeOneAuthAccount(id: string) {
    const accountsDir = Deno.env.get('LOCALAPPDATA') +
        '\\Microsoft\\OneAuth\\accounts'
    const filePath = `${accountsDir}\\${id}`
    try {
        await Deno.remove(filePath)
        return true
    } catch (error) {
        console.error(`Failed to remove account file ${filePath}:`, error)
        return false
    }
}
