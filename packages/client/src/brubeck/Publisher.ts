import { BrubeckClient } from './BrubeckClient'
import StreamMessageCreator from '../publish/MessageCreator'
import { getStreamId, StreamIDish } from '../publish/utils'
import { FailedToPublishError } from '../publish'

export default class BrubeckPublisher {
    client
    messageCreator
    constructor(client: BrubeckClient) {
        this.client = client
        this.messageCreator = new StreamMessageCreator(this.client.client)
    }

    async publishMessage(streamObjectOrId: StreamIDish, {
        content,
        timestamp = new Date(),
        partitionKey
    }: {
        content: any
        timestamp?: string | number | Date
        partitionKey?: string | number
    }) {
        const streamMessage = await this.messageCreator.create(streamObjectOrId, {
            content,
            timestamp,
            partitionKey,
        })
        const node = await this.client.getNode()
        node.publish(streamMessage)
    }

    async publish(streamObjectOrId: StreamIDish, content: any, timestamp?: string | number | Date, partitionKey?: string | number) {
        // wrap publish in error emitter
        try {
            return await this.publishMessage(streamObjectOrId, {
                content,
                timestamp,
                partitionKey,
            })
        } catch (err) {
            getStreamId(streamObjectOrId)
            const streamId = getStreamId(streamObjectOrId)
            const error = new FailedToPublishError(
                streamId,
                content,
                err
            )
            throw error
        }
    }
}
