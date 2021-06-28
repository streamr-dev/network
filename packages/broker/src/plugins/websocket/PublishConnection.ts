import WebSocket from 'ws'
import { StreamrClient } from 'streamr-client'
import { Logger } from 'streamr-network'
import { ParsedQs } from 'qs'
import { parsePositiveInteger, parseQueryParameter } from '../../helpers/parser'
import { Connection } from './Connection'
import { closeWithError } from '../../helpers/closeWebsocket'
import { PayloadFormat } from '../../helpers/PayloadFormat'

const logger = new Logger(module)

export class PublishConnection implements Connection {

    streamId: string
    partition?: number
    partitionKey?: string
    partitionKeyField?: string

    constructor(streamId: string, queryParams: ParsedQs) {
        this.streamId = streamId
        this.partition = parseQueryParameter<number>('partition', queryParams, parsePositiveInteger)
        this.partitionKey = queryParams['partitionKey'] as string|undefined
        this.partitionKeyField = queryParams['partitionKeyField'] as string|undefined
        const partitionDefinitions = [this.partition, this.partitionKey, this.partitionKeyField].filter((d) => d !== undefined)
        if (partitionDefinitions.length > 1) {
            throw new Error('Invalid combination of "partition", "partitionKey" and "partitionKeyField"')
        }
    }
    
    init(ws: WebSocket, streamrClient: StreamrClient, payloadFormat: PayloadFormat) {
        ws.on('message', (payload: string) => {
            try {
                const { content, metadata } = payloadFormat.createMessage(payload)
                const partitionKey = this.partitionKey ?? (this.partitionKeyField ? (content[this.partitionKeyField] as string) : undefined)
                streamrClient.publish({
                    id: this.streamId,
                    partition: this.partition
                }, content, metadata.timestamp, partitionKey)
            } catch (err: any) {
                closeWithError(err, 'Unable to publish', ws, logger)
            }
        })
    }
}