import { instanceId } from './utils'
import { pOnce } from './promises'
import { iteratorFinally } from './iterators'
import * as G from './GeneratorUtils'
import { ErrorSignal, Signal } from './Signal'
import { StreamrClientError } from '../StreamrClientError'

export type PipelineTransform<InType = any, OutType = any> = (src: AsyncGenerator<InType>) => AsyncGenerator<OutType>

type AsyncGeneratorWithId<T> = AsyncGenerator<T> & {
    id: string
}

/**
 * Pipeline public interface
 */

export type IPipeline<InType, OutType = InType> = {
    pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>): IPipeline<InType, NewOutType>
    filter(fn: G.GeneratorFilter<OutType>): IPipeline<InType, OutType>
} & AsyncGenerator<OutType>

class PipelineDefinition<InType, OutType = InType> {
    public source: AsyncGeneratorWithId<InType>
    protected transforms: PipelineTransform[]

    constructor(source: AsyncGenerator<InType>, transforms: PipelineTransform[] = []) {
        this.source = this.setSource(source)
        this.transforms = transforms
    }

    /**
     * Append a transformation step to this pipeline.
     * Changes the pipeline's output type to output type of this generator.
     */
    pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>): PipelineDefinition<InType, NewOutType> {
        this.transforms.push(fn)
        return this as PipelineDefinition<InType, unknown> as PipelineDefinition<InType, NewOutType>
    }

    clearTransforms() {
        this.transforms = []
    }

    setSource(source: AsyncGenerator<InType> | AsyncGeneratorWithId<InType>) {
        const id = 'id' in source ? source.id : instanceId(source, 'Source')
        this.source = Object.assign(source, {
            id
        })

        return this.source
    }

    getTransforms() {
        return this.transforms
    }
}

export class Pipeline<InType, OutType = InType> implements IPipeline<InType, OutType> {
    public source: AsyncGenerator<InType>
    protected iterator: AsyncGenerator<OutType>
    private isIterating = false
    public isCleaningUp = false
    private definition: PipelineDefinition<InType, OutType>

    constructor(source: AsyncGenerator<InType>, definition?: PipelineDefinition<InType, OutType>) {
        this.source = source
        this.definition = definition ?? new PipelineDefinition<InType, OutType>(source)
        this.cleanup = pOnce(this.cleanup.bind(this))
        this.iterator = iteratorFinally(this.iterate(), this.cleanup)
        this.handleError = this.handleError.bind(this)
    }

    /**
     * Append a transformation step to this pipeline.
     * Changes the pipeline's output type to output type of this generator.
     */
    pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>): Pipeline<InType, NewOutType> {
        if (this.isIterating) {
            throw new StreamrClientError(`cannot pipe after already iterating: ${this.isIterating}`, 'PIPELINE_ERROR')
        }
        this.definition.pipe(fn)
        // this allows .pipe chaining to be type aware
        // i.e. new Pipeline(Type1).pipe(Type1 => Type2).pipe(Type2 => Type3)
        return this as Pipeline<InType, unknown> as Pipeline<InType, NewOutType>
    }

    /**
     * Triggers once when pipeline ends.
     * Usage: `pipeline.onFinally(callback)`
     */
    onFinally = Signal.once<[Error | undefined]>()

    /**
     * Triggers once when pipeline is about to end.
     */
    onBeforeFinally = Signal.once()

    onMessage = Signal.create<[OutType]>()

    onError = ErrorSignal.create<[Error, (InType | OutType)?]>()

    filter(fn: G.GeneratorFilter<OutType>): Pipeline<InType, OutType> {
        return this.pipe((src) => G.filter(src, fn, this.onError.trigger))
    }

    flow(): this {
        setImmediate(() => {
            // consume if not already doing so
            if (!this.isIterating) {
                G.consume(this)
            }
        })

        return this
    }

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

    async handleError(err: Error): Promise<void> {
        await this.onError.trigger(err)
    }

    private async *iterate(): AsyncGenerator<any, void, unknown> {
        this.isIterating = true

        if (!this.definition.source) {
            throw new StreamrClientError('no source', 'PIPELINE_ERROR')
        }

        const transforms = this.definition.getTransforms()

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
            throw new StreamrClientError('already iterating', 'PIPELINE_ERROR')
        }

        return this
    }
}
