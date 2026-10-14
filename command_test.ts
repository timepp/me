import { CommandManager, parseCommandConfigs } from './command.ts'
import {
    filterCommandsByName,
    resolveCommandSelection,
    resolveExactCommandId,
    summarizeOneAuthAccounts,
} from './cli.ts'

const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

async function assertRejects(
    action: () => Promise<unknown>,
    expectedMessage: string,
): Promise<void> {
    let error: unknown
    try {
        await action()
    } catch (caught) {
        error = caught
    }
    assert(error instanceof Error, 'operation should reject')
    assert(
        error.message.includes(expectedMessage),
        `error should include "${expectedMessage}", got "${error.message}"`,
    )
}

Deno.test('CommandManager persists GUID commands and compound references', async () => {
    const directory = await Deno.makeTempDir()
    const path = `${directory}\\commands.json`
    await Deno.writeTextFile(path, '[]\n')
    const manager = new CommandManager(path)

    try {
        const referenced = await manager.addCommand({
            type: 'url',
            name: 'Deno',
            url: 'https://docs.deno.com',
        })
        assert(
            /^[0-9a-f-]{36}$/.test(referenced.id),
            'added command should have a GUID',
        )

        const compound = await manager.addCommand({
            type: 'compound',
            name: 'References',
            tags: ['docs'],
            mode: 'all',
            subCommandIds: [referenced.id],
        })
        assert(
            compound.type === 'compound' &&
                compound.subCommandIds[0] === referenced.id,
            'compound command should reference the existing command',
        )

        await assertRejects(
            () => manager.deleteCommand(referenced.id),
            'is used by compound command',
        )

        const updated = await manager.updateCommand(compound.id, {
            type: 'url',
            name: 'TypeScript',
            url: 'https://www.typescriptlang.org',
        })
        assert(updated.id === compound.id, 'update should preserve the GUID')

        await manager.deleteCommand(referenced.id)
        assert(
            (await manager.getCommands()).length === 1,
            'unreferenced command should be deleted',
        )

        await Promise.all([
            manager.addCommand({
                type: 'url',
                name: 'One',
                url: 'https://one.example',
            }),
            manager.addCommand({
                type: 'url',
                name: 'Two',
                url: 'https://two.example',
            }),
        ])
        assert(
            (await manager.getCommands()).length === 3,
            'concurrent additions should both be persisted',
        )
    } finally {
        await Deno.remove(directory, { recursive: true })
    }
})

Deno.test('parseCommandConfigs validates GUID references and cycles', () => {
    const urlCommand = {
        id: firstId,
        type: 'url',
        name: 'Child',
        url: 'https://example.com',
    }
    parseCommandConfigs([
        urlCommand,
        {
            id: secondId,
            type: 'compound',
            name: 'Parent',
            mode: 'all',
            subCommandIds: [firstId],
        },
    ])

    for (
        const invalidCommands of [
            [{ ...urlCommand, id: 'not-a-guid' }],
            [
                urlCommand,
                {
                    id: secondId,
                    type: 'compound',
                    name: 'Missing reference',
                    mode: 'all',
                    subCommandIds: ['33333333-3333-4333-8333-333333333333'],
                },
            ],
            [
                {
                    id: firstId,
                    type: 'compound',
                    name: 'First',
                    mode: 'all',
                    subCommandIds: [secondId],
                },
                {
                    id: secondId,
                    type: 'compound',
                    name: 'Second',
                    mode: 'all',
                    subCommandIds: [firstId],
                },
            ],
        ]
    ) {
        let error: unknown
        try {
            parseCommandConfigs(invalidCommands)
        } catch (caught) {
            error = caught
        }
        assert(error instanceof TypeError, 'invalid command graph should fail')
    }
})

Deno.test('CLI resolves exact IDs and filters command names', () => {
    const commands = [
        { id: firstId, name: 'First' },
        { id: secondId, name: 'Second' },
        {
            id: '83369144-c077-45c2-8556-6496d07f32d1',
            name: 'Test Tenants',
        },
    ]
    assert(
        resolveExactCommandId(firstId.toUpperCase(), commands) === firstId,
        'an exact ID match should be case-insensitive',
    )
    assert(
        filterCommandsByName(
            'test TEN',
            commands.map((command) => ({
                ...command,
                type: 'message' as const,
                content: command.name,
            })),
        )[0].id === commands[2].id,
        'name filtering should be case-insensitive and allow partial names',
    )
    const commandConfigs = commands.map((command) => ({
        ...command,
        type: 'message' as const,
        content: command.name,
    }))
    assert(
        resolveCommandSelection('2', commandConfigs).id === secondId,
        'a command number should select the matching filtered command',
    )

    let missingError: unknown
    try {
        resolveExactCommandId('8336', commands)
    } catch (error) {
        missingError = error
    }
    assert(
        missingError instanceof Error &&
            missingError.message.includes('not found'),
        'a partial ID should not be accepted by --run',
    )
})

Deno.test('CLI summarizes OneAuth accounts without verbose fields', () => {
    const summary = summarizeOneAuthAccounts([
        {
            id: 'account-id',
            displayName: 'Ada Lovelace',
            token: 'must-not-be-rendered',
            nested: { large: 'value' },
        },
    ])
    assert(summary.length === 1, 'one account should produce one summary row')
    assert(summary[0]['#'] === 1, 'summary should include a display index')
    assert(
        summary[0].account === 'Ada Lovelace',
        'summary should use a recognizable account name',
    )
    assert(summary[0].id === 'account-id', 'summary should retain account ID')
    assert(
        !('token' in summary[0]) && !('nested' in summary[0]),
        'summary should exclude verbose and sensitive fields',
    )
})

Deno.test('CommandManager runs message and chosen compound commands', async () => {
    const directory = await Deno.makeTempDir()
    const path = `${directory}\\commands.json`
    const messageId = '33333333-3333-4333-8333-333333333333'
    const compoundId = '44444444-4444-4444-8444-444444444444'
    await Deno.writeTextFile(
        path,
        JSON.stringify([
            {
                id: messageId,
                type: 'message',
                name: 'Child',
                description: 'Read this',
                content: 'Hello',
            },
            {
                id: compoundId,
                type: 'compound',
                name: 'Parent',
                mode: 'choose',
                subCommandIds: [messageId],
            },
        ]),
    )
    const manager = new CommandManager(path)
    const prompts: Array<{
        topic: string
        choices?: string[]
        allowFreeString?: boolean
    }> = []

    try {
        const results = await manager.runCommand(
            compoundId,
            (topic, choices, allowFreeString) => {
                prompts.push({ topic, choices, allowFreeString })
                return Promise.resolve(choices?.[0])
            },
        )
        assert(prompts.length === 1, 'choose should request input')
        assert(
            prompts[0].choices?.[0] === 'Child (message)',
            'compound command should expose its child as a choice',
        )
        assert(results.length === 1, 'message command should return one result')
        assert(
            results[0].type === 'message' &&
                results[0].title === 'Child' &&
                results[0].description === 'Read this' &&
                results[0].content === 'Hello',
            'message command should return content for the caller to render',
        )
    } finally {
        await Deno.remove(directory, { recursive: true })
    }
})

Deno.test('commands.json preserves original commands with GUID ids', async () => {
    const commands = parseCommandConfigs(
        JSON.parse(
            await Deno.readTextFile(
                new URL('./commands.json', import.meta.url),
            ),
        ),
    )
    const names = new Set(commands.map((command) => command.name))
    for (
        const name of [
            'Launch SSH proxy',
            '拦截postMessage消息',
            'Request repo permissions in 1ES',
            'Arch Dashboard',
            "Open '%OneDrive%\\Arch'",
            'Open this app',
            'Arch Space',
            'OneAuth Accounts',
            'CDX',
            '943 admin center',
            '486 admin center',
            'PDS 547',
            'Test Tenants',
        ]
    ) {
        assert(names.has(name), `commands.json should preserve "${name}"`)
    }
    assert(
        commands.length === 26,
        'nested commands should be normalized into 26 commands',
    )
})
