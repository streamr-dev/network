import WebSocket from 'ws'
import { StreamrClient } from 'streamr-client'
import { Connection } from './Connection'
import { parsePositiveInteger, parseQueryParameterArray } from '../../helpers/parser'
import { ParsedQs } from 'qs'

export class SubscribeConnection implements Connection {

    streamId: string
    partitions?: number[]

    constructor(streamId: string, queryParams: ParsedQs) {
        this.streamId = streamId
        this.partitions = parseQueryParameterArray('partitions', queryParams, parsePositiveInteger)
    }

    init(ws: WebSocket, streamrClient: StreamrClient) {
        const streamPartDefitions = (this.partitions !== undefined)
            ? this.partitions.map((partition: number|undefined) => ({ id: this.streamId, partition }))
            : [{ id: this.streamId }]
        streamPartDefitions.forEach((streamDefinition) => {
            streamrClient.subscribe(streamDefinition, (message: any) => {
                ws.send(JSON.stringify(message))
            })
        })
    }
}