import { instanceId } from './utils'
import { pOnce } from './promises'
import { Debug } from './log'
import { iteratorFinally } from './iterators'
import { ContextError, Context } from './Context'
import * as G from './GeneratorUtils'
import { ErrorSignal, Signal } from './Signal'

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
    /** @internal */
    id
    /** @internal */
    debug
    protected iterator: AsyncGenerator<OutType>
    private isIterating = false
    /** @internal */
    public isCleaningUp = false
    private definition: PipelineDefinition<InType, OutType>

    /** @internal */
    constructor(public source: AsyncGenerator<InType>, definition?: PipelineDefinition<InType, OutType>) {
        this.id = instanceId(this)
        this.debug = Debug(this.id)
        this.definition = definition || new PipelineDefinition<InType, OutType>(this, source)
        this.cleanup = pOnce(this.cleanup.bind(this))
        this.iterator = iteratorFinally(this.iterate(), this.cleanup)
        this.handleError = this.handleError.bind(this)
    }

    /**
     * Append a transformation step to this pipeline.
     * Changes the pipeline's output type to output type of this generator.
     * @internal
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
     * @internal
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
     * @internal
     */
    onConsumed(fn: () => void | Promise<void>): Pipeline<InType, Awaited<OutType>> {
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
     * @internal
     */
    onFinally = Signal.once<[Error | void]>()

    /**
     * Triggers once when pipeline is about to end.
     * @internal
     */
    onBeforeFinally = Signal.once()

    /**
     * Triggers once when pipeline starts flowing.
     * Usage: `pipeline.onStart(callback)`
     * @internal
     */
    onStart = Signal.once()

    /** @internal */
    onMessage = Signal.create<[OutType]>()

    // eslint-disable-next-line func-call-spacing, no-spaced-func
    /** @internal */
    onError = ErrorSignal.create<[Error, (InType | OutType)?, number?]>()

    /** @internal */
    map<NewOutType>(fn: G.GeneratorMap<OutType, NewOutType>): Pipeline<InType, NewOutType> {
        return this.pipe((src) => G.map(src, fn, this.onError.trigger))
    }

    /** @internal */
    mapBefore(fn: G.GeneratorMap<InType, InType>): Pipeline<InType, OutType> {
        return this.pipeBefore((src) => G.map(src, fn, this.onError.trigger))
    }

    /** @internal */
    forEach(fn: G.GeneratorForEach<OutType>): Pipeline<InType, OutType> {
        return this.pipe((src) => G.forEach(src, fn, this.onError.trigger))
    }

    /** @internal */
    filter(fn: G.GeneratorFilter<OutType>): Pipeline<InType, OutType> {
        return this.pipe((src) => G.filter(src, fn, this.onError.trigger))
    }

    /** @internal */
    reduce<NewOutType>(fn: G.GeneratorReduce<OutType, NewOutType>, initialValue: NewOutType): Pipeline<InType, NewOutType> {
        return this.pipe((src) => G.reduce(src, fn, initialValue, this.onError.trigger))
    }

    /** @internal */
    forEachBefore(fn: G.GeneratorForEach<InType>): Pipeline<InType, OutType> {
        return this.pipeBefore((src) => G.forEach(src, fn, this.onError.trigger))
    }

    /** @internal */
    filterBefore(fn: G.GeneratorFilter<InType>): Pipeline<InType, OutType> {
        return this.pipeBefore((src) => G.filter(src, fn, this.onError.trigger))
    }

    /** @internal */
    async consume(fn?: G.GeneratorForEach<OutType>): Promise<void> {
        return G.consume(this, fn, this.handleError)
    }

    /** @internal */
    collect(n?: number): Promise<OutType[]> {
        return G.collect(this, n, this.handleError)
    }

    /** @internal */
    flow(): this {
        setImmediate(() => {
            // consume if not already doing so
            if (!this.isIterating) {
                this.consume()
            }
        })

        return this
    }

    /** @internal */
    private async cleanup(error?: Error): Promise<void> {
        this.isCleaningUp = true
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

    /** @internal */
    async handleError(err: Error): Promise<void> {
        await this.onError.trigger(err)
    }

    private async* iterate(): AsyncGenerator<any, void, unknown> {
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
            this.isCleaningUp = true
        } catch (err) {
            this.isCleaningUp = true
            await this.handleError(err)
        } finally {
            this.isCleaningUp = true
            if (!this.onBeforeFinally.triggerCount) {
                await this.onBeforeFinally.trigger()
            }
        }
    }

    // AsyncGenerator implementation

    /** @internal */
    async throw(err: Error): Promise<IteratorResult<OutType, any>> {
        if (this.isCleaningUp) {
            throw err
        }

        if (!this.onBeforeFinally.triggerCount) {
            await this.onBeforeFinally.trigger()
        }

        // eslint-disable-next-line promise/no-promise-in-callback
        await this.definition.source.throw(err).catch(() => {})
        return this.iterator.throw(err)
    }

    /** @internal */
    async return(v?: OutType): Promise<IteratorResult<OutType, any>> {
        if (this.isCleaningUp) {
            return Promise.resolve({ done: true, value: v } as IteratorReturnResult<OutType>)
        }

        if (!this.onBeforeFinally.triggerCount) {
            await this.onBeforeFinally.trigger()
        }

        await this.definition.source.return(undefined)
        return this.iterator.return(v)
    }

    /** @internal */
    async next(): Promise<IteratorResult<OutType, any>> {
        return this.iterator.next()
    }

    /**
     * Create a new Pipeline forked from this pipeline.
     * Pushes results into fork.
     * Note: Does not start consuming this pipeline.
     */

    [Symbol.asyncIterator](): this {
        if (this.isIterating) {
            throw new PipelineError(this, 'already iterating')
        }

        return this
    }
}
