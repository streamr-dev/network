import { IPushBuffer, PushBuffer, DEFAULT_BUFFER_SIZE, pull, PushBufferOptions, PullOptions } from './PushBuffer'
import * as G from './GeneratorUtils'
import { Pipeline, PipelineTransform } from './Pipeline'

/**
 * Pipeline that is also a PushBuffer.
 * i.e. can call .push to push data into pipeline and .pipe to transform it.
 */
export class PushPipeline<InType, OutType = InType> extends Pipeline<InType, OutType> implements IPushBuffer<InType, OutType> {
    /** @internal */
    readonly source: PushBuffer<InType>

    constructor(bufferSize = DEFAULT_BUFFER_SIZE, options?: PushBufferOptions) {
        const inputBuffer = new PushBuffer<InType>(bufferSize, options)
        super(inputBuffer)
        this.source = inputBuffer
    }

    /** @internal */
    pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>): PushPipeline<InType, NewOutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        super.pipe(fn)
        return this as PushPipeline<InType, unknown> as PushPipeline<InType, NewOutType>
    }

    /** @internal */
    map<NewOutType>(fn: G.GeneratorMap<OutType, NewOutType>): PushPipeline<InType, NewOutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        return super.map(fn) as PushPipeline<InType, NewOutType>
    }

    /** @internal */
    mapBefore(fn: G.GeneratorMap<InType, InType>): PushPipeline<InType, OutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        return super.mapBefore(fn) as PushPipeline<InType, OutType>
    }

    /** @internal */
    filterBefore(fn: G.GeneratorFilter<InType>): PushPipeline<InType, OutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        return super.filterBefore(fn) as PushPipeline<InType, OutType>
    }

    /** @internal */
    filter(fn: G.GeneratorFilter<OutType>): PushPipeline<InType, OutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        return super.filter(fn) as PushPipeline<InType, OutType>
    }

    /** @internal */
    forEach(fn: G.GeneratorForEach<OutType>): PushPipeline<InType, OutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        return super.forEach(fn) as PushPipeline<InType, OutType>
    }

    /** @internal */
    forEachBefore(fn: G.GeneratorForEach<InType>): PushPipeline<InType, OutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        return super.forEachBefore(fn) as PushPipeline<InType, OutType>
    }

    /** @internal */
    pull(source: AsyncGenerator<InType>, opts?: PullOptions) {
        return pull(source, this, opts)
    }

    // wrapped PushBuffer methods below here

    /** @internal */
    async push(item: InType | Error) {
        return this.source.push(item)
    }

    /** @internal */
    async handleError(err: Error) {
        try {
            await this.onError.trigger(err)
        } catch (error) {
            if (this.isCleaningUp) {
                throw error
            }

            await this.push(error)
        }
    }

    /** @internal */
    end(err?: Error) {
        return this.source.end(err)
    }

    /** @internal */
    endWrite(err?: Error) {
        return this.source.endWrite(err)
    }

    /** @internal */
    isDone() {
        return this.source.isDone()
    }

    /** @internal */
    get length() {
        return this.source.length || 0
    }

    /** @internal */
    isFull() {
        return this.source.isFull()
    }

    /** @internal */
    clear() {
        return this.source.clear()
    }
}
