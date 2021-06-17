import WebSocket from 'ws'
import { StreamrClient } from 'streamr-client'

export interface Connection {
    init: (ws: WebSocket, streamrClient: StreamrClient) => void
}