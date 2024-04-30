import { Logger } from '@streamr/utils'
import { WebSocket, WebSocketConfiguration } from 'node-datachannel'
import { AbstractWebsocketClientConnection, Socket } from './AbstractWebsocketClientConnection'

const logger = new Logger(module)

const BINARY_TYPE = 'nodebuffer'
const CLOSED = 0
const OPEN = 1

export class WebsocketClientConnection extends AbstractWebsocketClientConnection {

    private socketImpl?: WebSocket
    protected socket: Socket = {

        binaryType: BINARY_TYPE,
        readyState: CLOSED,
        close: (_code?: number, _reason?: string) => {
            this.socketImpl?.close()
        },
        send: (data: string | Buffer | ArrayBuffer | ArrayBufferView): void => {
            this.socketImpl?.sendMessageBinary(data as Uint8Array)
        }
    }

    // TODO explicit default value for "selfSigned" or make it required
    public connect(address: string, selfSigned?: boolean): void {
        if (!this.destroyed) {
            const webSocketConfig: WebSocketConfiguration = { maxMessageSize: 1048576 }
            if (selfSigned) {
                webSocketConfig.disableTlsVerification = true
            }

            this.socketImpl = new WebSocket()
            this.socketImpl.open(address)

            this.socketImpl.onError((error: string) => this.onError(new Error(error)))

            this.socketImpl.onOpen(() => {
                this.socket.readyState = OPEN
                this.onOpen()
            })

            this.socketImpl.onClosed(() => {
                this.socket.readyState = CLOSED
                this.onClose(0, '')
            })
            this.socketImpl.onMessage((message: Buffer | string) => {
                if (!this.destroyed) {
                    if (typeof message === 'string') {
                        logger.debug('Received string data, only binary data is supported')
                    } else {
                        this.onMessage(new Uint8Array(message))
                    }
                }
            })
        } else {
            logger.debug('Tried to connect() a stopped connection')
        }
    }

    // eslint-disable-next-line class-methods-use-this
    protected stopListening(): void {
        //this.socket?.removeAllListeners()
    }

}
