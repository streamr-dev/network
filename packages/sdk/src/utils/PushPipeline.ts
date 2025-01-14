import { IPushBuffer, PushBuffer, DEFAULT_BUFFER_SIZE } from './PushBuffer'
import * as G from './GeneratorUtils'
import { Pipeline, PipelineTransform } from './Pipeline'

/**
 * Pipeline that is also a PushBuffer.
 * i.e. can call .push to push data into pipeline and .pipe to transform it.
 */
export class PushPipeline<InType, OutType = InType>
    extends Pipeline<InType, OutType>
    implements IPushBuffer<InType, OutType>
{
    override readonly source: PushBuffer<InType>

    constructor(bufferSize = DEFAULT_BUFFER_SIZE) {
        const inputBuffer = new PushBuffer<InType>(bufferSize)
        super(inputBuffer)
        this.source = inputBuffer
    }

    override pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>): PushPipeline<InType, NewOutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        super.pipe(fn)
        return this as PushPipeline<InType, unknown> as PushPipeline<InType, NewOutType>
    }

    override filter(fn: G.GeneratorFilter<OutType>): PushPipeline<InType, OutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        return super.filter(fn) as PushPipeline<InType, OutType>
    }

    // wrapped PushBuffer methods below here

    async push(item: InType | Error): Promise<boolean> {
        return this.source.push(item)
    }

    override async handleError(err: Error): Promise<void> {
        try {
            await this.onError.trigger(err)
        } catch (error) {
            if (this.isCleaningUp) {
                throw error
            }

            await this.push(error)
        }
    }

    end(err?: Error): void {
        this.source.end(err)
    }

    endWrite(err?: Error): void {
        this.source.endWrite(err)
    }

    isDone(): boolean {
        return this.source.isDone()
    }

    get length(): number {
        return this.source.length || 0
    }

    clear(): void {
        this.source.clear()
    }
}
