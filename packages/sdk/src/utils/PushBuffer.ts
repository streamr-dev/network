import { Gate } from './Gate'
import { StreamrClientError } from '../StreamrClientError'

export const DEFAULT_BUFFER_SIZE = 256

function isError(err: any): err is Error {
    if (!err) {
        return false
    }

    if (err instanceof Error) {
        return true
    }

    return !!(err?.stack && err.message && typeof err.stack === 'string' && typeof err.message === 'string')
}

export type IPushBuffer<InType, OutType = InType> = {
    push(item: InType): Promise<boolean>
    end(error?: Error): void
    endWrite(error?: Error): void
    length: number
    isDone(): boolean
    clear(): void
} & AsyncGenerator<OutType>

/**
 * Implements an async buffer.
 * Push items into buffer, push will async block once buffer is full.
 * and will unblock once buffer has been consumed.
 */
export class PushBuffer<T> implements IPushBuffer<T> {
    protected buffer: (T | Error)[] = []
    readonly bufferSize: number

    /** open when writable */
    protected readonly writeGate: Gate
    /** open when readable */
    protected readonly readGate: Gate

    protected error: Error | undefined
    protected iterator: AsyncGenerator<T>
    protected isIterating = false

    constructor(bufferSize = DEFAULT_BUFFER_SIZE) {
        if (!(bufferSize > 0 && Number.isSafeInteger(bufferSize))) {
            throw new StreamrClientError(
                `bufferSize must be a safe positive integer, got: ${bufferSize}`,
                'INVALID_ARGUMENT'
            )
        }

        this.bufferSize = bufferSize
        // start both closed
        this.writeGate = new Gate()
        this.readGate = new Gate()
        this.writeGate.close()
        this.readGate.close()
        this.iterator = this.iterate()
    }

    /**
     * Puts item in buffer and opens readGate.
     * Blocks until writeGate is open again (or locked)
     * @returns Promise<true> if item was pushed, Promise<false> if done or became done before writeGate opened.
     */
    async push(item: T | Error): Promise<boolean> {
        if (!this.isWritable()) {
            return false
        }

        this.buffer.push(item)
        this.updateWriteGate()
        this.readGate.open()
        return this.writeGate.check()
    }

    private updateWriteGate(): void {
        this.writeGate.setOpenState(!this.isFull())
    }

    /**
     * Immediate end of reading and writing
     * Buffer will not flush.
     */
    end(err?: Error): void {
        if (err) {
            this.error = err
        }
        this.lock()
    }

    /**
     * Prevent further reads or writes.
     */
    lock(): void {
        this.writeGate.lock()
        this.readGate.lock()
    }

    /**
     * Prevent further writes.
     * Allows buffer to flush before ending.
     */
    endWrite(err?: Error): void {
        if (err && !this.error) {
            this.error = err
        }

        this.readGate.open()
        this.writeGate.lock()
    }

    /**
     * True if buffered at least bufferSize items.
     * After this point, push will block until buffer is emptied again.
     */
    private isFull(): boolean {
        return this.buffer.length >= this.bufferSize
    }

    /**
     * True if buffer has closed reads and writes.
     */
    isDone(): boolean {
        return this.writeGate.isLocked && this.readGate.isLocked
    }

    /**
     * Can't write if write gate locked.
     * No point writing if read gate is locked.
     */
    isWritable(): boolean {
        return !this.writeGate.isLocked && !this.readGate.isLocked
    }

    private async *iterate(): AsyncGenerator<T, void, unknown> {
        this.isIterating = true
        try {
            // if there's something buffered, we want to flush it
            while (!this.readGate.isLocked) {
                // keep reading off front of buffer until buffer empty
                while (this.buffer.length && !this.readGate.isLocked) {
                    const v = this.buffer.shift()!
                    // maybe open write gate
                    this.updateWriteGate()
                    if (isError(v)) {
                        throw v
                    }

                    yield v
                }
                if (this.buffer.length === 0 && this.writeGate.isLocked) {
                    break
                }

                if (this.isDone()) {
                    // buffer is empty and we're done
                    break
                }

                // buffer must be empty, close readGate until more writes.
                this.readGate.close()
                // wait for something to be written
                const ok = await this.readGate.check()
                if (!ok) {
                    // no more reading
                    break
                }
            }

            const { error } = this
            if (error) {
                this.error = undefined
                throw error
            }
        } finally {
            this.buffer = []
            this.lock()
        }
    }

    get length(): number {
        return this.buffer.length
    }

    // clears any pending items in buffer
    clear(): void {
        this.buffer = []
    }

    // AsyncGenerator implementation

    async throw(err: Error): Promise<IteratorResult<T, any>> {
        this.endWrite(err)
        return this.iterator.throw(err)
    }

    async return(v?: T): Promise<IteratorResult<T, any>> {
        this.end()
        return this.iterator.return(v)
    }

    next(): Promise<IteratorResult<T, any>> {
        return this.iterator.next()
    }

    [Symbol.asyncIterator](): this {
        if (this.isIterating) {
            // @ts-expect-error ts can't do this.constructor properly
            throw new this.constructor.Error(this, 'already iterating')
        }

        return this
    }
}

/**
 * Pull from a source into some PushBuffer
 */
export async function pull<InType, OutType = InType>(
    src: AsyncGenerator<InType>,
    dest: IPushBuffer<InType, OutType>
): Promise<void> {
    if (!src) {
        throw new Error('no source')
    }

    try {
        for await (const v of src) {
            const ok = await dest.push(v)
            if (!ok) {
                break
            }
        }
    } catch (err) {
        dest.endWrite(err)
    } finally {
        dest.endWrite()
    }
}
