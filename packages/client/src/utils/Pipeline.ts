import { instanceId, pOnce } from './index'
import { Debug } from './log'
import { iteratorFinally } from './iterators'
import { IPushBuffer, PushBuffer, DEFAULT_BUFFER_SIZE, pull, PushBufferOptions } from './PushBuffer'
import { ContextError, Context } from './Context'
import * as G from './GeneratorUtils'
import Signal, { ErrorSignal } from './Signal'

export type PipelineTransform<InType = any, OutType = any> = (src: AsyncGenerator<InType>) => AsyncGenerator<OutType>
export type FinallyFn = ((err?: Error) => void | Promise<void>)

class PipelineError extends ContextError {}

type AsyncGeneratorWithId<T> = AsyncGenerator<T> & {
    id: string,
}

/**
 * Pipeline public interface
 */

export type IPipeline<InType, OutType = InType> = {
    pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>): IPipeline<InType, NewOutType>
    map<NewOutType>(fn: G.GeneratorMap<OutType, NewOutType>): IPipeline<InType, NewOutType>
    mapBefore(fn: G.GeneratorMap<InType, InType>): IPipeline<InType, OutType>
    filter(fn: G.GeneratorFilter<OutType>): IPipeline<InType, OutType>
    forEach(fn: G.GeneratorForEach<OutType>): IPipeline<InType, OutType>
    forEachBefore(fn: G.GeneratorForEach<InType>): IPipeline<InType, OutType>
    filterBefore(fn: G.GeneratorForEach<InType>): IPipeline<InType, OutType>
    collect(n?: number): Promise<OutType[]>
    consume(): Promise<void>
    pipeBefore(fn: PipelineTransform<InType, InType>): IPipeline<InType, OutType>
} & AsyncGenerator<OutType> & Context

class PipelineDefinition<InType, OutType = InType> {
    id
    debug
    public source: AsyncGeneratorWithId<InType>
    constructor(
        context: Context,
        source: AsyncGenerator<InType>,
        protected transforms: PipelineTransform[] = [],
        protected transformsBefore: PipelineTransform[] = []
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        // this.debug('create')
        this.source = this.setSource(source)
    }

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

    clearTransforms() {
        this.transforms.length = 0
        this.transformsBefore.length = 0
    }

    setSource(source: AsyncGenerator<InType> | AsyncGeneratorWithId<InType>) {
        const id = 'id' in source ? source.id : instanceId(source, 'Source') // eslint-disable-line no-param-reassign
        this.source = Object.assign(source, {
            id,
        })

        return this.source
    }

    getTransforms() {
        return [...this.transformsBefore, ...this.transforms]
    }
}

export class Pipeline<InType, OutType = InType> implements IPipeline<InType, OutType> {
    debug
    id
    protected iterator: AsyncGenerator<OutType>
    isIterating = false
    definition: PipelineDefinition<InType, OutType>

    constructor(public source: AsyncGenerator<InType>, definition?: PipelineDefinition<InType, OutType>) {
        this.id = instanceId(this)
        this.debug = Debug(this.id)
        this.definition = definition || new PipelineDefinition<InType, OutType>(this, source)
        this.cleanup = pOnce(this.cleanup.bind(this))
        this.iterator = iteratorFinally(this.iterate(), this.cleanup)
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

    /**
     * Fires this callback the moment this part of the pipeline starts returning.
     */
    onConsumed(fn: () => void | Promise<void>) {
        return this.pipe(async function* onConsumed(src) {
            try {
                yield* src
            } finally {
                await fn()
            }
        })
    }

    /**
     * Triggers once when pipeline ends.
     * Usage: `pipeline.onFinally(callback)`
     */
    onFinally = Signal.once<[Error | void]>()

    /**
     * Triggers once when pipeline is about to end.
     */
    onBeforeFinally = Signal.once()

    /**
     * Triggers once when pipeline starts flowing.
     * Usage: `pipeline.onStart(callback)`
     */
    onStart = Signal.once()

    onMessage = Signal.create<[OutType]>()

    // eslint-disable-next-line func-call-spacing, no-spaced-func
    onError = ErrorSignal.create<[Error, (InType | OutType)?, number?]>()

    map<NewOutType>(fn: G.GeneratorMap<OutType, NewOutType>) {
        return this.pipe((src) => G.map(src, fn, this.onError.trigger))
    }

    mapBefore(fn: G.GeneratorMap<InType, InType>) {
        return this.pipeBefore((src) => G.map(src, fn, this.onError.trigger))
    }

    forEach(fn: G.GeneratorForEach<OutType>) {
        return this.pipe((src) => G.forEach(src, fn, this.onError.trigger))
    }

    filter(fn: G.GeneratorFilter<OutType>) {
        return this.pipe((src) => G.filter(src, fn, this.onError.trigger))
    }

    reduce<NewOutType>(fn: G.GeneratorReduce<OutType, NewOutType>, initialValue: NewOutType) {
        return this.pipe((src) => G.reduce(src, fn, initialValue, this.onError.trigger))
    }

    forEachBefore(fn: G.GeneratorForEach<InType>) {
        return this.pipeBefore((src) => G.forEach(src, fn, this.onError.trigger))
    }

    filterBefore(fn: G.GeneratorFilter<InType>) {
        return this.pipeBefore((src) => G.filter(src, fn, this.onError.trigger))
    }

    async consume(fn?: G.GeneratorForEach<OutType>): Promise<void> {
        return G.consume(this, fn, this.onError.trigger)
    }

    collect(n?: number) {
        return G.collect(this, n, this.onError.trigger)
    }

    flow() {
        setImmediate(() => {
            // consume if not already doing so
            if (!this.isIterating) {
                this.consume().catch(() => {}) // prevent unhandled
            }
        })

        return this
    }

    private async cleanup(error?: Error) {
        try {
            try {
                if (error) {
                    await this.onError.trigger(error)
                }
            } finally {
                await this.definition.source.return(undefined)
            }
        } finally {
            await this.onBeforeFinally.trigger()
            await this.onFinally.trigger(error)
            this.definition.clearTransforms()
        }
    }

    private async* iterate() {
        this.isIterating = true
        await this.onStart.trigger()

        // this.debug('iterate', this.definition.source)
        if (!this.definition.source) {
            throw new PipelineError(this, 'no source')
        }

        const transforms = this.definition.getTransforms()
        // this.debug('transforms', transforms)

        // each pipeline step creates a generator
        // which is then passed into the next transform
        // end result is output of last transform's generator
        const pipeline = transforms.reduce((prev: AsyncGenerator, transform) => {
            return transform(prev)
        }, this.definition.source)

        try {
            for await (const msg of pipeline) {
                await this.onMessage.trigger(msg)
                yield msg
            }
        } catch (err) {
            await this.onError.trigger(err)
        } finally {
            await this.onBeforeFinally.trigger()
        }
    }

    // AsyncGenerator implementation

    async throw(err: Error) {
        if (!this.onBeforeFinally.triggerCount) {
            await this.onBeforeFinally.trigger()
        }

        // eslint-disable-next-line promise/no-promise-in-callback
        await this.definition.source.throw(err).catch(() => {})
        return this.iterator.throw(err)
    }

    async return(v?: OutType) {
        if (!this.onBeforeFinally.triggerCount) {
            await this.onBeforeFinally.trigger()
        }

        await this.definition.source.return(undefined)
        return this.iterator.return(v)
    }

    async next() {
        return this.iterator.next()
    }

    /**
     * Create a new Pipeline forked from this pipeline.
     * Pushes results into fork.
     * Note: Does not start consuming this pipeline.
     */

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

    map<NewOutType>(fn: G.GeneratorMap<OutType, NewOutType>): PushPipeline<InType, NewOutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        return super.map(fn) as PushPipeline<InType, NewOutType>
    }

    mapBefore(fn: G.GeneratorMap<InType, InType>): PushPipeline<InType, OutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        return super.mapBefore(fn) as PushPipeline<InType, OutType>
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

    async push(item: InType | Error) {
        return this.source.push(item)
    }

    async pushError(err: Error) {
        try {
            await this.onError.trigger(err)
        } catch (error) {
            await this.push(error)
        }
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

    clear() {
        return this.source.clear()
    }
}
