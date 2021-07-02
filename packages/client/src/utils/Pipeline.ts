import { Gate, counterId } from './index'
import { iteratorFinally } from './iterators'
import { Debug } from './log'

const rootDebug = Debug('Pipeline')

export class PushBuffer<T> {
    size: number
    buffer: T[] = []
    writeGate = new Gate()
    readGate = new Gate()
    done = false
    error: Error | undefined

    constructor(size = 10) {
        this.size = size
        this.writeGate.close()
        this.readGate.close()
    }

    async push(item: T) {
        this.buffer.push(item)
        this.readGate.open()
        this.writeGate.setOpenState(this.buffer.length <= this.size)
        return this.writeGate.check()
    }

    end() {
        this.done = true
        this.readGate.lock()
        this.writeGate.lock()
    }

    async* [Symbol.asyncIterator]() {
        try {
            while (!this.done) {
                // eslint-disable-next-line no-await-in-loop
                const ok = await this.readGate.check()
                if (!ok) {
                    break
                }

                while (this.buffer.length) {
                    const v = this.buffer.shift()!
                    this.writeGate.setOpenState(this.buffer.length <= this.size)
                    yield v
                }

                this.readGate.close()

                if (this.done) {
                    break
                }
            }
        } finally {
            this.buffer.length = 0
            this.writeGate.lock()
            this.readGate.lock()
        }
    }
}

export async function* PumpBuffer<T>(src: AsyncGenerator<T>, size = 10) {
    const debug = rootDebug.extend(counterId('PushBuffer'))
    const buffer: T[] = []
    const writeGate = new Gate()
    const readGate = new Gate()
    readGate.close()
    writeGate.close()
    let done = false
    let error: Error | undefined

    async function pull() {
        try {
            for await (const v of src) {
                buffer.push(v)
                debug('buffer', v)
                readGate.open()
                writeGate.setOpenState(buffer.length <= size)
                const ok = await writeGate.check()
                if (!ok) {
                    break
                }
            }
        } catch (err) {
            error = err
        }
        readGate.lock()
        done = true
    }

    try {
        pull()

        while (!done) {
            // eslint-disable-next-line no-await-in-loop
            const ok = await readGate.check()
            if (!ok) {
                break
            }

            while (buffer.length) {
                const v = buffer.shift()!
                writeGate.setOpenState(buffer.length <= size)
                yield v
            }

            readGate.close()

            if (done) {
                break
            }
        }

        if (error) {
            throw error
        }
    } finally {
        buffer.length = 0
        writeGate.lock()
        readGate.lock()
        await src.return(undefined)
    }
}

type PipelineGeneratorFunction<InType = any, OutType = any> = (src: AsyncGenerator<InType>) => AsyncGenerator<OutType>

export class Pipeline<InType> {
    source
    bufferSize
    transforms: PipelineGeneratorFunction[] = []
    iterator?: AsyncGenerator<InType>
    private finallyFn?: ((err?: Error) => void | Promise<void>)

    constructor(source: AsyncGenerator<InType>, bufferSize = 256) {
        this.source = source
        this.bufferSize = bufferSize
    }

    pipe<OutType>(this: Pipeline<InType>, fn: PipelineGeneratorFunction<InType, OutType>): Pipeline<OutType> {
        this.transforms.push(fn)
        return this as unknown as Pipeline<OutType>
    }

    finally(onFinally: ((err?: Error) => void | Promise<void>)) {
        this.finallyFn = onFinally
        return this
    }

    throw(err: Error) {
        return this[Symbol.asyncIterator]().throw(err)
    }

    return(v?: InType) {
        return this[Symbol.asyncIterator]().return(v)
    }

    next() {
        return this[Symbol.asyncIterator]().next()
    }

    private cleanup = async (error?: Error) => {
        try {
            await this.source.return(undefined)
        } finally {
            if (this.finallyFn) {
                await this.finallyFn(error)
            }
        }
    }

    [Symbol.asyncIterator]() {
        if (this.iterator) {
            return this.iterator
        }

        this.iterator = iteratorFinally((async function* PipelineIterate(this: Pipeline<InType>) {
            if (!this.transforms.length) {
                throw new Error('no transforms')
            }

            const line = this.transforms.reduce((prev: AsyncGenerator, transform) => {
                return transform(prev)
            }, this.source)

            const c = PumpBuffer<InType>(line, this.bufferSize)
            yield* c
        }.bind(this)()), this.cleanup)

        return this.iterator
    }
}

