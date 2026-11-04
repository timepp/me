import { runUrlCommand } from './url-command.ts'

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

Deno.test({
    name: 'URL commands preserve shell characters and percent escapes on Windows',
    ignore: Deno.build.os !== 'windows',
    async fn() {
        const OriginalCommand = Deno.Command
        let echoed = ''
        let launches = 0
        Deno.Command = class extends OriginalCommand {
            constructor(command: string | URL, options: Deno.CommandOptions = {}) {
                assert(command === 'cmd', 'default browser should use cmd')
                const args = [...(options.args ?? [])]
                const startIndex = args.indexOf('start')
                assert(startIndex >= 0, 'command should use start')
                // Exercise real cmd parsing without opening a browser.
                args[startIndex] = 'echo'
                super(command, { ...options, args })
            }

            override async output(): Promise<Deno.CommandOutput> {
                launches++
                const output = await super.output()
                echoed = new TextDecoder().decode(output.stdout).trimEnd()
                return output
            }
        }
        try {
            for (
                const url of [
                    'https://example.com/',
                    'https://example.com/message/19:thread@thread.skype/123?tenantId=one&groupId=two&teamName=Calling%2FMeeting%2FDevices&channelName=Announcements',
                    'https://example.com/a path?q=%PATH%&value=!literal!&other=(one)^two|three',
                ]
            ) {
                await runUrlCommand({
                    id: '11111111-1111-4111-8111-111111111111',
                    type: 'url',
                    name: 'URL',
                    url,
                })
                assert(
                    echoed === `"" "${url}"`,
                    `cmd must receive the complete URL unchanged, got ${echoed}`,
                )
            }
            assert(launches === 3, 'each URL should launch exactly once')
        } finally {
            Deno.Command = OriginalCommand
        }
    },
})

Deno.test('URL commands reject quotes and line breaks before invoking cmd', async () => {
    for (const character of ['"', '\r', '\n']) {
        let error: unknown
        try {
            await runUrlCommand({
                id: '11111111-1111-4111-8111-111111111111',
                type: 'url',
                name: 'Invalid URL',
                url: `https://example.com/${character}`,
            })
        } catch (caught) {
            error = caught
        }
        assert(
            error instanceof Error &&
                error.message === 'URL must not contain double quotes or line breaks.',
            'unsafe shell input should fail with an explicit error',
        )
    }
})
