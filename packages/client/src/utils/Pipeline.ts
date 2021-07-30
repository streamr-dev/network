import { instanceId, pOnce } from './index'
import { Debug } from './log'
import { iteratorFinally } from './iterators'
import { IPushBuffer, PushBuffer, DEFAULT_BUFFER_SIZE, pull } from './PushBuffer'
import { ContextError, Context } from './Context'

export type PipelineTransform<InType = any, OutType = any> = (src: AsyncGenerator<InType>) => AsyncGenerator<OutType>

export type FinallyFn = ((err?: Error) => void | Promise<void>)

class PipelineError extends ContextError {}
class PushPipelineError extends ContextError {}

/**
 * Pipeline public interface
 */
export type IPipeline<InType, OutType = InType> = {
    pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>): IPipeline<InType, NewOutType>
    onFinally(onFinally: FinallyFn): IPipeline<InType, OutType>
} & AsyncGenerator<OutType> & Context

export class Pipeline<InType, OutType = InType> implements IPipeline<InType, OutType> {
    debug
    id
    readonly source: AsyncGenerator<InType>
    protected readonly transforms: PipelineTransform[] = []
    protected readonly transformsBefore: PipelineTransform[] = []
    protected iterator: AsyncGenerator<OutType>
    protected finallyTasks: FinallyFn[] = []
    protected isIterating = false

    constructor(source: AsyncGenerator<InType>) {
        this.source = source
        this.id = instanceId(this)
        this.cleanup = pOnce(this.cleanup.bind(this))
        this.debug = Debug(this.id)
        this.iterator = iteratorFinally(this.iterate(), this.cleanup)
        // this.debug('create')
    }

    /**
     * Append a transformation step to this pipeline.
     * Changes the pipeline's output type to output type of this generator.
     */
    pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>): Pipeline<InType, NewOutType> {
        if (this.isIterating) {
            throw new PipelineError(this, 'cannot pipe after already iterating')
        }

        this.transforms.push(fn)
        // this allows .pipe chaining to be type aware
        // i.e. new Pipeline(Type1).pipe(Type1 => Type2).pipe(Type2 => Type3)
        return this as Pipeline<InType, unknown> as Pipeline<InType, NewOutType>
    }

    /**
     * Inject pipeline step before other transforms.
     * Note must return same type as source, otherwise we can't be type-safe.
     */
    pipeBefore(fn: PipelineTransform<InType, InType>): Pipeline<InType, OutType> {
        if (this.isIterating) {
            throw new PipelineError(this, 'cannot pipe after already iterating')
        }

        this.transformsBefore.push(fn)
        return this
    }

    /**
     * Append a function to run when pipeline ends.
     */
    onFinally(onFinallyFn: FinallyFn) {
        this.finallyTasks.push(onFinallyFn)
        return this
    }

    private async runFinally(err?: Error) {
        let error = err
        if (!this.finallyTasks.length) { return }
        await this.finallyTasks.reduce(async (prev, task) => {
            return prev.then(() => {
                return task(error)
            }, (internalErr) => {
                error = internalErr
                return task(error)
            })
        }, Promise.resolve()) // eslint-disable-line promise/no-promise-in-callback
    }

    private async cleanup(error?: Error) {
        try {
            if (error) {
                await this.source.throw(error)
            } else {
                await this.source.return(undefined)
            }
        } finally {
            await this.runFinally(error)
        }
    }

    private async* iterate() {
        this.isIterating = true
        if (!this.source) {
            throw new PipelineError(this, 'no source')
        }

        const transforms = [...this.transformsBefore, ...this.transforms]

        if (!transforms.length) {
            yield* this.source
            return
        }

        yield* transforms.reduce((prev: AsyncGenerator, transform) => {
            // each pipeline step creates a generator
            // which is then passed into the next transform
            // end result is output of last transform's generator
            // pulled into an async buffer
            return transform(prev)
        }, this.source)
    }

    // AsyncGenerator implementation

    async throw(err: Error) {
        // eslint-disable-next-line promise/no-promise-in-callback
        await this.source.throw(err).catch(() => {})
        return this.iterator.throw(err)
    }

    async return(v?: OutType) {
        await this.source.return(undefined)
        return this.iterator.return(v)
    }

    async next() {
        return this.iterator.next()
    }

    [Symbol.asyncIterator]() {
        if (this.isIterating) {
            throw new PipelineError(this, 'cannot iterate, already iterating')
        }

        return this
    }
}

/**
 * Pipeline that is also a PushBuffer.
 * i.e. can call .push to push data into pipeline and .pipe to transform it.
 */

export class PushPipeline<InType, OutType = InType> extends Pipeline<InType, OutType> implements IPushBuffer<InType, OutType> {
    readonly source: PushBuffer<InType>
    constructor(bufferSize = DEFAULT_BUFFER_SIZE) {
        const inputBuffer = new PushBuffer<InType>(bufferSize)
        super(inputBuffer)
        this.source = inputBuffer
    }

    pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>): PushPipeline<InType, NewOutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        super.pipe(fn)
        return this as PushPipeline<InType, unknown> as PushPipeline<InType, NewOutType>
    }

    /**
     * Collect n/all messages into an array.
     */
    async collect(n?: number) {
        if (this.isIterating) {
            throw new PushPipelineError(this, 'Cannot collect if already iterating.')
        }

        const msgs = []
        for await (const msg of this) {
            if (n === 0) {
                break
            }

            msgs.push(msg)

            if (msgs.length === n) {
                break
            }
        }
        return msgs
    }

    pull(source: AsyncGenerator<InType>) {
        return pull(source, this)
    }

    // wrapped PushBuffer methods below here

    async push(item: InType) {
        return this.source.push(item)
    }

    end(err?: Error) {
        return this.source.end(err)
    }

    endWrite(err?: Error) {
        return this.source.endWrite(err)
    }

    isDone() {
        return this.source.isDone()
    }

    get length() {
        return this.source.length || 0
    }

    isFull() {
        return this.source.isFull()
    }
}
