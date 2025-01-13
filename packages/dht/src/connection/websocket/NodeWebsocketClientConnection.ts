import { Logger, binaryToUtf8 } from '@streamr/utils'
import { WebSocket } from 'ws'
import { AbstractWebsocketClientConnection } from './AbstractWebsocketClientConnection'

const logger = new Logger(module)

const BINARY_TYPE = 'nodebuffer'

export class WebsocketClientConnection extends AbstractWebsocketClientConnection {
    protected socket?: WebSocket

    // TODO explicit default value for "selfSigned" or make it required
    public connect(address: string, selfSigned?: boolean): void {
        if (!this.destroyed) {
            this.socket = new WebSocket(address, { rejectUnauthorized: !selfSigned })
            this.socket.binaryType = BINARY_TYPE
            this.socket.on('error', (error: Error) => this.onError(error))
            this.socket.on('open', () => this.onOpen())
            this.socket.on('close', (code: number, reason: Buffer) => this.onClose(code, binaryToUtf8(reason)))
            this.socket.on('message', (message: Buffer, isBinary: boolean) => {
                if (!this.destroyed) {
                    if (isBinary === false) {
                        logger.debug('Received string data, only binary data is supported')
                    } else {
                        this.onMessage(new Uint8Array(message))
                    }
                }
            })
        } else {
            logger.debug('Tried to connect() a stopped connection', { id: this.connectionId })
        }
    }

    protected stopListening(): void {
        this.socket?.removeAllListeners()
    }
}
