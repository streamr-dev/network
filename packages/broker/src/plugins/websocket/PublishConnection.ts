import WebSocket from 'ws'
import { StreamrClient } from 'streamr-client'
import { Logger } from 'streamr-network'
import { ParsedQs } from 'qs'
import { parsePositiveInteger, parseQueryParameter } from '../../helpers/parser'
import { Connection } from './Connection'

const logger = new Logger(module)

const STATUS_UNEXPECTED_CONDITION = 1011

const parsePayloadJson = (contentAsString: string) => {
    try {
        return JSON.parse(contentAsString)
    } catch (e) {
        throw new Error('Payload is not a JSON string')
    }
}

const closeWithError = (error: any, context: string, ws: WebSocket) => {
    const msg = `${context}: ${error.message}`
    logger.error(error, msg)
    ws.close(STATUS_UNEXPECTED_CONDITION, msg)
}

export class PublishConnection implements Connection {

    streamId: string
    partition?: number
    partitionKey?: string

    constructor(streamId: string, queryParams: ParsedQs) {
        this.streamId = streamId
        this.partition = parseQueryParameter<number>('partition', queryParams, parsePositiveInteger)
        this.partitionKey = queryParams['partitionKey'] as string
        if ((this.partition !== undefined) && (this.partitionKey !== undefined)) {
            throw new Error('Invalid combination of "partition" and "partitionKey"')
        }
    }
    
    init(ws: WebSocket, streamrClient: StreamrClient) {
        ws.on('message', (contentPayload: string) => {
            let content
            try {
                content = parsePayloadJson(contentPayload)
                streamrClient.publish({
                    id: this.streamId,
                    partition: this.partition
                }, content, undefined, this.partitionKey)
            } catch (err: any) {
                closeWithError(err, 'Unable to publish', ws)
            }
        })
    }
}