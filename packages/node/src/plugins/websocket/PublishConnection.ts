import WebSocket from 'ws'
import { StreamrClient } from '@streamr/sdk'
import { Logger } from '@streamr/utils'
import { ParsedQs } from 'qs'
import { v4 as uuid } from 'uuid'
import { Connection, PING_PAYLOAD } from './Connection'
import { PayloadFormat } from '../../helpers/PayloadFormat'
import { PublishPartitionDefinition, getPartitionKey, parsePublishPartitionDefinition } from '../../helpers/partitions'

export class PublishConnection implements Connection {
    streamId: string
    partitionDefinition: PublishPartitionDefinition

    constructor(streamId: string, queryParams: ParsedQs) {
        this.streamId = streamId
        this.partitionDefinition = parsePublishPartitionDefinition(queryParams)
    }

    async init(
        ws: WebSocket,
        socketId: string,
        streamrClient: StreamrClient,
        payloadFormat: PayloadFormat
    ): Promise<void> {
        const logger = new Logger(module, { socketId })
        const msgChainId = uuid()
        ws.on('message', async (data: WebSocket.RawData) => {
            const payload = data.toString()
            if (payload !== PING_PAYLOAD) {
                try {
                    const { content, metadata } = payloadFormat.createMessage(payload)
                    await streamrClient.publish(
                        {
                            id: this.streamId,
                            partition: this.partitionDefinition.partition
                        },
                        content,
                        {
                            timestamp: metadata.timestamp,
                            partitionKey: getPartitionKey(content, this.partitionDefinition),
                            msgChainId
                        }
                    )
                } catch (err: any) {
                    logger.warn('Unable to publish', {
                        err,
                        streamId: this.streamId,
                        partition: this.partitionDefinition.partition,
                        partitionKey: this.partitionDefinition.partitionKey,
                        msgChainId
                    })
                }
            }
        })
    }
}
