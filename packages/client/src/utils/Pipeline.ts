import { instanceId, pOnce } from './index'
import { iteratorFinally } from './iterators'
import { PullBuffer } from './PushBuffer'

type PipelineGeneratorFunction<InType = any, OutType = any> = (src: AsyncGenerator<InType>) => AsyncGenerator<OutType>

export class Pipeline<InType> implements AsyncGenerator<InType> {
    readonly id
    private readonly bufferSize: number
    private readonly source
    private readonly transforms: PipelineGeneratorFunction[] = []
    private iterator?: AsyncGenerator<InType>
    private finallyFn?: ((err?: Error) => void | Promise<void>)

    constructor(source: AsyncGenerator<InType>, bufferSize = 256) {
        this.bufferSize = bufferSize
        this.source = source
        this.id = instanceId(this)
        this.cleanup = pOnce(this.cleanup.bind(this))
    }

    pipe<OutType>(this: Pipeline<InType>, fn: PipelineGeneratorFunction<InType, OutType>): Pipeline<OutType> {
        if (this.iterator) {
            throw new Error('cannot pipe after already iterating')
        }

        this.transforms.push(fn)
        // this allows chaining to be type aware
        // i.e. new Pipeline(Type1).pipe(Type1 => Type2).pipe(Type2 => Type3)
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

    private async cleanup(error?: Error) {
        try {
            if (error) {
                await this.source.throw(error)
            } else {
                await this.source.return(undefined)
            }
        } finally {
            if (this.finallyFn) {
                await this.finallyFn(error)
            }
        }
    }

    private async* generatePipeline() {
        if (!this.transforms.length) {
            throw new Error('no transforms')
        }

        // each pipeline step creates a generator
        // which is then passed into the next transform
        // end result is output of last transform's generator
        // pulled into an async buffer
        const line = this.transforms.reduce((prev: AsyncGenerator, transform) => {
            return transform(prev)
        }, this.source)
        yield* new PullBuffer<InType>(line, this.bufferSize)
    }

    [Symbol.asyncIterator]() {
        if (this.iterator) {
            return this.iterator
        }

        // wrap pipeline in iteratorFinally to ensure it's cleaned up
        this.iterator = iteratorFinally(this.generatePipeline(), this.cleanup)
        return this.iterator
    }
}
