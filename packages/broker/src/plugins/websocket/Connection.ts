import WebSocket from 'ws'
import { StreamrClient } from 'streamr-client'
import { PayloadFormat } from '../../helpers/PayloadFormat'

export interface Connection {
    init: (ws: WebSocket, streamrClient: StreamrClient, payloadFormat: PayloadFormat) => void
}