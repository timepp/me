export const commandOutputLimit = 1024 * 1024

export class CommandOutputBuffer {
    private chunks: Uint8Array[] = []
    private size = 0
    truncated = false

    constructor(private readonly limit = commandOutputLimit) {
        if (!Number.isSafeInteger(limit) || limit < 1) {
            throw new RangeError('Output limit must be a positive integer')
        }
    }

    append(text: string): void {
        const chunk = new TextEncoder().encode(text)
        if (!chunk.length) return
        this.chunks.push(chunk)
        this.size += chunk.length
        while (this.size > this.limit) {
            this.truncated = true
            const first = this.chunks[0]
            const removed = Math.min(first.length, this.size - this.limit)
            if (removed === first.length) this.chunks.shift()
            else this.chunks[0] = first.slice(removed)
            this.size -= removed
        }

    }

    replace(text: string): void {
        this.chunks = []
        this.size = 0
        this.truncated = false
        this.append(text)
    }

    get text(): string {
        const data = new Uint8Array(this.size)
        let offset = 0
        for (const chunk of this.chunks) {
            data.set(chunk, offset)
            offset += chunk.length
        }
        let start = 0
        while (start < data.length && (data[start] & 0xc0) === 0x80) start++
        return new TextDecoder().decode(data.subarray(start))
    }
}
