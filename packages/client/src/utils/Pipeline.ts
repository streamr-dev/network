import { instanceId, pOnce } from './index'
import { Debug } from './log'
import { iteratorFinally } from './iterators'
import { PullBuffer } from './PushBuffer'
import { ContextError, Context } from './Context'

export type PipelineGeneratorFunction<InType = any, OutType = any> = (src: AsyncGenerator<InType>) => AsyncGenerator<OutType>

class PipelineError extends ContextError {}
export type IPipeline<InType, OutType = InType> = {
    pipe<NewOutType>(fn: PipelineGeneratorFunction<OutType, NewOutType>): IPipeline<InType, NewOutType>
    finally(onFinally: ((err?: Error) => void | Promise<void>)): IPipeline<InType, OutType>
} & AsyncGenerator<OutType> & Context

export class Pipeline<InType, OutType = InType> implements IPipeline<InType, OutType> {
    readonly debug
    readonly id
    private readonly bufferSize: number
    readonly source
    private readonly transforms: PipelineGeneratorFunction[] = []
    private iterator: AsyncGenerator<OutType>
    private finallyFn?: ((err?: Error) => void | Promise<void>)
    private isIterating = false
    private buffer?: PullBuffer<OutType>

    constructor(source: AsyncGenerator<InType>, bufferSize = 256) {
        this.bufferSize = bufferSize
        this.source = source
        this.id = instanceId(this)
        this.cleanup = pOnce(this.cleanup.bind(this))
        this.debug = Debug(this.id)
        this.iterator = iteratorFinally(this.iterate(), this.cleanup)
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
        this.buffer?.end()
        return this.iterator.throw(err)
    }

    async return(v?: OutType) {
        this.buffer?.end()
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

    private async* iterate() {
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

        try {
            this.buffer = new PullBuffer<OutType>(line, this.bufferSize)
            yield* this.buffer
        } finally {
            this.buffer = undefined
        }
    }

    get length() {
        return this.buffer?.length || 0
    }

    [Symbol.asyncIterator]() {
        if (this.isIterating) {
            throw new PipelineError(this, 'cannot iterate, already iterating')
        }

        return this.iterator
    }
}
