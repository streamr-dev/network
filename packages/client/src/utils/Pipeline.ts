import { instanceId, pOnce, Defer } from './index'
import { Debug } from './log'
import { iteratorFinally } from './iterators'
import { IPushBuffer, PushBuffer, DEFAULT_BUFFER_SIZE, pull, PushBufferOptions } from './PushBuffer'
import { ContextError, Context } from './Context'
import * as G from './GeneratorUtils'
import Signal from './Signal'

export type PipelineTransform<InType = any, OutType = any> = (src: AsyncGenerator<InType>) => AsyncGenerator<OutType>
export type FinallyFn = ((err?: Error) => void | Promise<void>)

class PipelineError extends ContextError {}

/**
 * Pipeline public interface
 */

export type IPipeline<InType, OutType = InType> = {
    pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>): IPipeline<InType, NewOutType>
    map<NewOutType>(fn: G.GeneratorMap<OutType, NewOutType>): IPipeline<InType, NewOutType>
    filter(fn: G.GeneratorFilter<OutType>): IPipeline<InType, OutType>
    forEach(fn: G.GeneratorForEach<OutType>): IPipeline<InType, OutType>
    forEachBefore(fn: G.GeneratorForEach<InType>): IPipeline<InType, OutType>
    filterBefore(fn: G.GeneratorForEach<InType>): IPipeline<InType, OutType>
    collect(n?: number): Promise<OutType[]>
    consume(): Promise<void>
    fork(bufferSize?: number, options?: PushBufferOptions): IPipeline<OutType>
    pipeBefore(fn: PipelineTransform<InType, InType>): IPipeline<InType, OutType>
    onFinally(onFinally: FinallyFn): IPipeline<InType, OutType>
} & AsyncGenerator<OutType> & Context

class PipelineDefinition<InType, OutType = InType> {
    protected transforms: PipelineTransform[] = []
    protected transformsBefore: PipelineTransform[] = []
    constructor(public source: AsyncGenerator<InType>) {}
    /**
     * Append a transformation step to this pipeline.
     * Changes the pipeline's output type to output type of this generator.
     */
    pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>): PipelineDefinition<InType, NewOutType> {
        this.transforms.push(fn)
        return this as PipelineDefinition<InType, unknown> as PipelineDefinition<InType, NewOutType>
    }

    /**
     * Inject pipeline step before other transforms.
     * Note must return same type as source, otherwise we can't be type-safe.
     */
    pipeBefore(fn: PipelineTransform<InType, InType>): PipelineDefinition<InType, OutType> {
        this.transformsBefore.push(fn)
        return this
    }

    getTransforms() {
        return [...this.transformsBefore, ...this.transforms]
    }
}

export class Pipeline<InType, OutType = InType> implements IPipeline<InType, OutType> {
    debug
    id
    definition: PipelineDefinition<InType, OutType>
    protected iterator: AsyncGenerator<OutType>
    protected isIterating = false
    buffers: PushBuffer<OutType>[] = []

    constructor(source: AsyncGenerator<InType>) {
        this.definition = new PipelineDefinition(source)
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
            throw new PipelineError(this, `cannot pipe after already iterating: ${this.isIterating}`)
        }
        this.definition.pipe(fn)
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
            throw new PipelineError(this, `cannot pipe after already iterating: ${this.isIterating}`)
        }

        this.definition.pipeBefore(fn)
        return this
    }

    onBuffering = Signal.once<void, this>(this)

    /**
     * Triggers once when pipeline starts flowing.
     * Usage: `pipeline.onStart(callback)`
     */
    onStart = Signal.once<void, this>(this)

    /**
     * Triggers once when pipeline ends.
     * Usage: `pipeline.onFinally(callback)`
     */
    onFinally = Signal.once<Error | undefined, this>(this)

    /**
     * Triggers once when pipeline is about to end.
     */
    onBeforeFinally = Signal.once(this)

    map<NewOutType>(fn: G.GeneratorMap<OutType, NewOutType>) {
        return this.pipe((src) => G.map(src, fn))
    }

    forEach(fn: G.GeneratorForEach<OutType>) {
        return this.pipe((src) => G.forEach(src, fn))
    }

    filter(fn: G.GeneratorFilter<OutType>) {
        return this.pipe((src) => G.filter(src, fn))
    }

    reduce<NewOutType>(fn: G.GeneratorReduce<OutType, NewOutType>, initialValue: NewOutType) {
        return this.pipe((src) => G.reduce(src, fn, initialValue))
    }

    forEachBefore(fn: G.GeneratorForEach<InType>) {
        return this.pipeBefore((src) => G.forEach(src, fn))
    }

    filterBefore(fn: G.GeneratorFilter<InType>) {
        return this.pipeBefore((src) => G.filter(src, fn))
    }

    consume(fn?: G.GeneratorForEach<OutType>) {
        return G.consume(this, fn)
    }

    collect(n?: number) {
        return G.collect(this, n)
    }

    private async cleanup(error?: Error) {
        try {
            if (error) {
                await this.definition.source.throw(error)
            } else {
                await this.definition.source.return(undefined)
            }
        } finally {
            await this.onBeforeFinally.trigger()
            await this.onFinally.trigger(error)
        }
    }

    private async* iterate() {
        this.isIterating = true
        if (!this.definition.source) {
            throw new PipelineError(this, 'no source')
        }

        this.onStart.trigger()

        const transforms = this.definition.getTransforms()

        if (!transforms.length) {
            yield* this.definition.source
            return
        }

        yield* transforms.reduce((prev: AsyncGenerator, transform) => {
            // each pipeline step creates a generator
            // which is then passed into the next transform
            // end result is output of last transform's generator
            return transform(prev)
        }, this.definition.source)

        this.onBeforeFinally.trigger()
    }

    // AsyncGenerator implementation

    async throw(err: Error) {
        await this.onBeforeFinally.trigger()
        // eslint-disable-next-line promise/no-promise-in-callback
        await this.definition.source.throw(err).catch(() => {})
        return this.iterator.throw(err)
    }

    async return(v?: OutType) {
        await this.onBeforeFinally.trigger()
        await this.definition.source.return(undefined)
        return this.iterator.return(v)
    }

    async next() {
        return this.iterator.next()
    }

    buffer(bufferSize?: number, options?: PushBufferOptions): Pipeline<OutType> {
        const p = new Pipeline<InType, OutType>(this.definition.source)
        p.definition = this.definition
        const buffer = new PushBuffer(bufferSize, options)
        // @ts-expect-error
        this.definition = new PipelineDefinition(buffer)
        this.onBeforeFinally(async () => {
            buffer.endWrite()
            p.return()
        })
        p.onBeforeFinally(() => {
            buffer.endWrite()
        })

        p.onStart(() => {
            this.onBuffering.trigger()
        })

        p.consume(async (v) => {
            await buffer.push(v)
        })

        return this as Pipeline<unknown> as Pipeline<OutType>
    }

    /**
     * Create a new Pipeline forked from this pipeline.
     * Pushes results into fork.
     * Note: Does not start consuming this pipeline.
     */
    fork(bufferSize?: number, options?: PushBufferOptions) {
        const buffer = new PushBuffer<OutType>(bufferSize, options)
        // // will need to override method in subclasses
        const childPipeline = new Pipeline(buffer)

        // buffer this pipeline if child pipeline starts iterating/buffering
        const bufferParent = () => {
            if (this.isIterating) { return }
            this.buffer()
        }

        childPipeline.onStart(bufferParent)
        childPipeline.onBuffering(bufferParent)

        this.pipe(async function* ToBuffer(src) {
            for await (const value of src) {
                await buffer.push(value)
                yield value
            }
            // need to use .pipe instead of .map + onBeforeFinally
            // as we need to know immediately when source ends
            // onBeforeFinally runs when pipeline ends, which includes
            // any buffer steps, which may not have been consumed yet
            // need to endWrite in order for child pipeline to end
            buffer.endWrite()
        })

        this.onBeforeFinally(() => {
            // if buffer is full, it will block on the push call above. we need
            // to signal writes have ended on the buffer to unblock push call.
            // can't wait for onFinally to close writes as it requires pipeline
            // to end and pipeline can't end until push call is unblocked.
            // onBeforeFinally fires as soon as we know the pipeline is ending
            buffer.endWrite()
        })
        return childPipeline
    }

    [Symbol.asyncIterator]() {
        if (this.isIterating) {
            throw new PipelineError(this, 'already iterating')
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

    constructor(bufferSize = DEFAULT_BUFFER_SIZE, options?: PushBufferOptions) {
        const inputBuffer = new PushBuffer<InType>(bufferSize, options)
        super(inputBuffer)
        this.source = inputBuffer
    }

    pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>): PushPipeline<InType, NewOutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        super.pipe(fn)
        return this as PushPipeline<InType, unknown> as PushPipeline<InType, NewOutType>
    }

    /**
     * Create a new Pipeline forked from this pipeline.
     * Pushes results into fork.
     * Note: Does not start consuming this pipeline.
     */
    fork(bufferSize?: number, options?: PushBufferOptions) {
        // // will need to override method in subclasses
        const childPipeline = new PushPipeline<OutType>(bufferSize, options)

        // buffer this pipeline if child pipeline starts iterating/buffering
        const bufferParent = () => {
            if (this.isIterating) { return }
            this.buffer()
        }

        childPipeline.onStart(bufferParent)
        childPipeline.onBuffering(bufferParent)

        this.pipe(async function* ToBuffer(src) {
            for await (const value of src) {
                await childPipeline.push(value)
                yield value
            }
            // need to use .pipe instead of .map + onBeforeFinally
            // as we need to know immediately when source ends
            // onBeforeFinally runs when pipeline ends, which includes
            // any buffer steps, which may not have been consumed yet
            // need to endWrite in order for child pipeline to end
            childPipeline.endWrite()
        })

        this.onBeforeFinally(() => {
            // if buffer is full, it will block on the push call above. we need
            // to signal writes have ended on the buffer to unblock push call.
            // can't wait for onFinally to close writes as it requires pipeline
            // to end and pipeline can't end until push call is unblocked.
            // onBeforeFinally fires as soon as we know the pipeline is ending
            childPipeline.endWrite()
        })

        return childPipeline
    }

    map<NewOutType>(fn: G.GeneratorMap<OutType, NewOutType>): PushPipeline<InType, NewOutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        return super.map(fn) as PushPipeline<InType, NewOutType>
    }

    filterBefore(fn: G.GeneratorFilter<InType>): PushPipeline<InType, OutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        return super.filterBefore(fn) as PushPipeline<InType, OutType>
    }

    filter(fn: G.GeneratorFilter<OutType>): PushPipeline<InType, OutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        return super.filter(fn) as PushPipeline<InType, OutType>
    }

    forEach(fn: G.GeneratorForEach<OutType>): PushPipeline<InType, OutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        return super.forEach(fn) as PushPipeline<InType, OutType>
    }

    forEachBefore(fn: G.GeneratorForEach<InType>): PushPipeline<InType, OutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        return super.forEachBefore(fn) as PushPipeline<InType, OutType>
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
