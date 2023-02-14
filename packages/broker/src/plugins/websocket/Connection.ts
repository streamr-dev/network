import WebSocket from 'ws'
import { StreamrClient } from 'streamr-client'
import { PayloadFormat } from '../../helpers/PayloadFormat'

export const PING_PAYLOAD = 'ping'
const PONG_PAYLOAD = 'pong'

export interface Connection {
    init: (ws: WebSocket, streamrClient: StreamrClient, payloadFormat: PayloadFormat) => void
}

// Implements application layer ping support. We have this feature because 
// browsers can't send pings in protocol level
export const addPingListener = (ws: WebSocket): void => {
    ws.on('message', (data: WebSocket.RawData) => {
        const payload = data.toString()
        if (payload === PING_PAYLOAD) {
            ws.send(PONG_PAYLOAD)
        }
    })
}
