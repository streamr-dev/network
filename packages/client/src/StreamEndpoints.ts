/**
 * Public Stream meta APIs.
 */
import { scoped, Lifecycle, inject, delay } from 'tsyringe'

import { instanceId } from './utils'
import { Context } from './utils/Context'

import { Stream } from './Stream'
import { ErrorCode } from './authFetch'
import { StreamRegistry } from './StreamRegistry'

export interface StreamValidationInfo {
    id: string
    partitions: number
    storageDays: number
}

@scoped(Lifecycle.ContainerScoped)
export class StreamEndpoints implements Context {
    /** @internal */
    readonly id
    /** @internal */
    readonly debug

    /** @internal */
    constructor(
        context: Context,
        @inject(delay(() => StreamRegistry)) private readonly streamRegistry: StreamRegistry,
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    /**
     * @category Important
     */
    async getOrCreateStream(props: { id: string, partitions?: number }): Promise<Stream> {
        this.debug('getOrCreateStream %o', {
            props,
        })
        try {
            return await this.streamRegistry.getStream(props.id)
        } catch (err: any) {
            // If stream does not exist, attempt to create it
            if (err.errorCode === ErrorCode.NOT_FOUND) {
                const stream = await this.streamRegistry.createStream(props)
                this.debug('created stream: %s %o', props.id, stream.toObject())
                return stream
            }
            throw err
        }
    }
}
