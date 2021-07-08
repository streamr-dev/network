import { instanceId, pOnce } from './index'
import { Debug } from './log'
import { iteratorFinally } from './iterators'
import { PullBuffer } from './PushBuffer'
import { ContextError, Context } from './Context'

export type PipelineGeneratorFunction<InType = any, OutType = any> = (src: AsyncGenerator<InType>) => AsyncGenerator<OutType>

class PipelineError extends ContextError {}

export class Pipeline<InType, OutType = InType> implements AsyncGenerator<OutType>, Context {
    readonly debug
    readonly id
    private readonly bufferSize: number
    private readonly source
    private readonly transforms: PipelineGeneratorFunction[] = []
    private iterator: AsyncGenerator<OutType>
    private finallyFn?: ((err?: Error) => void | Promise<void>)
    private isIterating = false

    constructor(source: AsyncGenerator<InType>, bufferSize = 256) {
        this.bufferSize = bufferSize
        this.source = source
        this.id = instanceId(this)
        this.cleanup = pOnce(this.cleanup.bind(this))
        this.debug = Debug(this.id)
        this.iterator = iteratorFinally(this.generatePipeline(), this.cleanup)
        // this.debug('create')
    }

    pipe<NewOutType>(fn: PipelineGeneratorFunction<OutType, NewOutType>): Pipeline<InType, NewOutType> {
        if (this.isIterating) {
            throw new PipelineError(this, 'cannot pipe after already iterating')
        }

        this.transforms.push(fn)
        // this allows .pipe chaining to be type aware
        // i.e. new Pipeline(Type1).pipe(Type1 => Type2).pipe(Type2 => Type3)
        return this as Pipeline<InType, unknown> as Pipeline<InType, NewOutType>
    }

    finally(onFinally: ((err?: Error) => void | Promise<void>)) {
        this.finallyFn = onFinally
        return this
    }

    throw(err: Error) {
        return this.iterator.throw(err)
    }

    return(v?: OutType) {
        return this.iterator.return(v)
    }

    next() {
        return this.iterator.next()
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
        this.isIterating = true
        if (!this.transforms.length) {
            throw new PipelineError(this, 'no transforms')
        }

        // each pipeline step creates a generator
        // which is then passed into the next transform
        // end result is output of last transform's generator
        // pulled into an async buffer
        const line = this.transforms.reduce((prev: AsyncGenerator, transform) => {
            return transform(prev)
        }, this.source)
        yield* new PullBuffer<OutType>(line, this.bufferSize)
    }

    [Symbol.asyncIterator]() {
        if (this.isIterating) {
            throw new PipelineError(this, 'cannot iterate, already iterating')
        }

        return this.iterator
    }
}
