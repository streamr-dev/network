import WebSocket from 'ws'
import { StreamrClient } from 'streamr-client'
import { PayloadFormat } from '../../helpers/PayloadFormat'

export const PING_PAYLOAD = 'ping'

export interface Connection {
    init: (ws: WebSocket, streamrClient: StreamrClient, payloadFormat: PayloadFormat) => void
}

export const addPingSender = (ws: WebSocket, sendInterval: number, disconnectTimeout: number): void => {
    let pendingStateChange: NodeJS.Timeout
    type State = 'active' | 'idle' | 'disconnected'

    const setState = (state: State) => {
        clearTimeout(pendingStateChange)
        if (state === 'active') {
            pendingStateChange = setTimeout(() => setState('idle'), sendInterval)
        } else if (state === 'idle') {
            ws.ping()
            if (disconnectTimeout !== 0) {
                pendingStateChange = setTimeout(() => setState('disconnected'), disconnectTimeout)
            }
        } else if (state === 'disconnected') {
            ws.terminate()
        }
    }
    
    const events = ['message', 'ping', 'pong']
    events.forEach((eventName) => {
        ws.on(eventName, () => setState('active'))
    })
    ws.on('close', () => clearTimeout(pendingStateChange))
    
    setState('idle')
}
