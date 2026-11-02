import {
    CommandOutputBuffer,
    commandOutputLimit,
} from './command-output-buffer.ts'

function assert(condition: unknown, message: string): void {
    if (!condition) throw new Error(message)
}

Deno.test('output buffer preserves whitespace and stays untruncated at exactly 1 MiB', () => {
    const buffer = new CommandOutputBuffer()
    const text = ` \n${'x'.repeat(commandOutputLimit - 3)}\n`
    buffer.append(text)
    assert(buffer.text === text, 'output must remain exact at the limit')
    assert(!buffer.truncated, 'exactly 1 MiB must not be truncated')
    buffer.append('z')
    assert(buffer.text === `${text.slice(1)}z`, 'oldest byte should be removed')
    assert(buffer.truncated, 'exceeding the limit must be indicated')
})

Deno.test('output buffer bounds many chunks and oversized chunks', () => {
    const buffer = new CommandOutputBuffer(8)
    for (const chunk of ['abc', 'def', 'ghi', 'jkl']) buffer.append(chunk)
    assert(
        buffer.text === 'efghijkl',
        'buffer should retain only the newest bytes',
    )
    buffer.append('0123456789')
    assert(buffer.text === '23456789', 'oversized chunks must also be bounded')
    buffer.append('')
    assert(buffer.text === '23456789', 'empty chunks must not change output')
})

Deno.test('output buffer truncates on UTF-8 boundaries without replacement characters', () => {
    const buffer = new CommandOutputBuffer(5)
    buffer.append('\u4e2d\u6587')
    assert(
        buffer.text === '\u6587',
        'a partial leading UTF-8 character must be dropped',
    )
    buffer.append('abc')
    assert(buffer.text === 'abc', 'subsequent truncation must keep valid UTF-8')
    assert(
        new TextEncoder().encode(buffer.text).length <= 5,
        'byte limit must hold',
    )
})

Deno.test('stdout and stderr buffers have independent limits', () => {
    const stdout = new CommandOutputBuffer(4)
    const stderr = new CommandOutputBuffer(4)
    stdout.append('12345')
    stderr.append('err')
    assert(stdout.text === '2345' && stdout.truncated, 'stdout must truncate')
    assert(
        stderr.text === 'err' && !stderr.truncated,
        'stderr must not be affected',
    )
})
