import { Logger } from '@streamr/utils'
import { ICloseEvent, IMessageEvent, w3cwebsocket as Websocket } from 'websocket'
import { AbstractWebsocketClientConnection } from './AbstractWebsocketClientConnection'

const logger = new Logger(module)

const BINARY_TYPE = 'arraybuffer'

export class WebsocketClientConnection extends AbstractWebsocketClientConnection {
    protected socket?: Websocket

    // TODO explicit default value for "selfSigned" or make it required
    public connect(address: string, selfSigned?: boolean): void {
        if (!this.destroyed) {
            this.socket = new Websocket(address, undefined, undefined, undefined, { rejectUnauthorized: !selfSigned })
            this.socket.binaryType = BINARY_TYPE
            this.socket.onerror = (error: Error) => this.onError(error)
            this.socket.onopen = () => this.onOpen()
            this.socket.onclose = (event: ICloseEvent) => this.onClose(event.code, event.reason)
            this.socket.onmessage = (message: IMessageEvent) => {
                if (!this.destroyed) {
                    if (typeof message.data === 'string') {
                        logger.debug('Received string data, only binary data is supported')
                    } else {
                        this.onMessage(new Uint8Array(message.data))
                    }
                }
            }
        } else {
            logger.debug('Tried to connect() a stopped connection')
        }
    }

    protected stopListening(): void {
        if (this.socket) {
            this.socket.onopen = undefined as unknown as () => void
            this.socket.onclose = undefined as unknown as () => void
            this.socket.onerror = undefined as unknown as () => void
            this.socket.onmessage = undefined as unknown as () => void
        }
    }
}
