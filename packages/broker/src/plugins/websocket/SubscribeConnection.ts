import WebSocket from 'ws'
import { StreamrClient } from 'streamr-client'
import { Connection } from './Connection'
import { parsePositiveInteger, parseQueryParameterArray } from '../../helpers/parser'
import { ParsedQs } from 'qs'
import { PayloadFormat } from '../../helpers/PayloadFormat'

export class SubscribeConnection implements Connection {

    streamId: string
    partitions?: number[]

    constructor(streamId: string, queryParams: ParsedQs) {
        this.streamId = streamId
        this.partitions = parseQueryParameterArray('partitions', queryParams, parsePositiveInteger)
    }

    init(ws: WebSocket, streamrClient: StreamrClient, payloadFormat: PayloadFormat): void {
        const streamPartDefitions = (this.partitions !== undefined)
            ? this.partitions.map((streamPartition: number) => ({ streamId: this.streamId, streamPartition }))
            : [{ streamId: this.streamId }]
        streamPartDefitions.forEach((streamDefinition) => {
            streamrClient.subscribe(streamDefinition, (content: any, metadata: any) => {
                const payload = payloadFormat.createPayload(content, metadata.messageId)
                ws.send(payload)
            })
        })
    }
}
