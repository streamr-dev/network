import WebSocket from 'ws'
import { StreamrClient } from '@streamr/sdk'
import { PayloadFormat } from '../../helpers/PayloadFormat'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export const PING_PAYLOAD = 'ping'
const PONG_PAYLOAD = 'pong'

export interface Connection {
    init(ws: WebSocket, socketId: string, streamrClient: StreamrClient, payloadFormat: PayloadFormat): Promise<void>
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

export const addPingSender = (
    ws: WebSocket,
    socketId: string,
    sendInterval: number,
    disconnectTimeout: number
): void => {
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
            logger.debug('Terminate connection', { socketId })
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
