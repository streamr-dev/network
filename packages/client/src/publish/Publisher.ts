/**
 * Public Publishing API
 */
import { StreamMessage } from 'streamr-client-protocol'
import { scoped, Lifecycle, inject, delay } from 'tsyringe'

import { instanceId } from '../utils/utils'
import { Context } from '../utils/Context'

import { MessageMetadata, PublishMetadata, PublishPipeline } from './PublishPipeline'
import { StreamDefinition } from '../types'

export type { PublishMetadata }

const parseTimestamp = (metadata?: MessageMetadata): number => {
    if (metadata?.timestamp === undefined) {
        return Date.now()
    } else {
        return metadata.timestamp instanceof Date ? metadata.timestamp.getTime() : new Date(metadata.timestamp).getTime()
    }
}

@scoped(Lifecycle.ContainerScoped)
export class Publisher implements Context {
    readonly id
    readonly debug

    constructor(
        context: Context,
        @inject(delay(() => PublishPipeline)) private pipeline: PublishPipeline
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    async publish<T>(streamDefinition: StreamDefinition, content: T, metadata?: MessageMetadata): Promise<StreamMessage<T>> {
        return this.pipeline.publish({
            streamDefinition,
            content,
            timestamp: parseTimestamp(metadata),
            partitionKey: metadata?.partitionKey,
            msgChainId: metadata?.msgChainId,
            messageType: metadata?.messageType,
            encryptionType: metadata?.encryptionType
        })
    }

    async start(): Promise<void> {
        this.pipeline.start()
    }

    async stop(): Promise<void> {
        return this.pipeline.stop()
    }
}
