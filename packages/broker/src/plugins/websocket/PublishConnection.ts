import WebSocket from 'ws'
import { StreamrClient } from 'streamr-client'
import { Logger } from '@streamr/utils'
import { ParsedQs } from 'qs'
import { v4 as uuid } from 'uuid'
import { parsePositiveInteger, parseQueryParameter } from '../../helpers/parser'
import { Connection, PING_PAYLOAD } from './Connection'
import { PayloadFormat } from '../../helpers/PayloadFormat'

export class PublishConnection implements Connection {

    streamId: string
    partition?: number
    partitionKey?: string
    partitionKeyField?: string

    constructor(streamId: string, queryParams: ParsedQs) {
        this.streamId = streamId
        this.partition = parseQueryParameter<number>('partition', queryParams, parsePositiveInteger)
        this.partitionKey = queryParams['partitionKey'] as string | undefined
        this.partitionKeyField = queryParams['partitionKeyField'] as string | undefined
        const partitionDefinitions = [this.partition, this.partitionKey, this.partitionKeyField].filter((d) => d !== undefined)
        if (partitionDefinitions.length > 1) {
            throw new Error('Invalid combination of "partition", "partitionKey" and "partitionKeyField"')
        }
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
                    const partitionKey = this.partitionKey ?? (this.partitionKeyField ? (content[this.partitionKeyField] as string) : undefined)
                    await streamrClient.publish({
                        id: this.streamId,
                        partition: this.partition
                    }, content, {
                        timestamp: metadata.timestamp,
                        partitionKey,
                        msgChainId
                    })
                } catch (err: any) {
                    logger.warn('Unable to publish', {
                        err,
                        streamId: this.streamId,
                        partition: this.partition,
                        partitionKey: this.partitionKey,
                        msgChainId,
                    })
                }
            }
        })
    }
}
