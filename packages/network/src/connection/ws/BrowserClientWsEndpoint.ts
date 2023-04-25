import { IMessageEvent, w3cwebsocket } from 'websocket'
import { PeerId, PeerInfo } from '../PeerInfo'
import { DisconnectionCode, DisconnectionReason } from "./AbstractWsEndpoint"
import { BrowserClientWsConnection, BrowserWebSocketConnectionFactory } from './BrowserClientWsConnection'
import { AbstractClientWsEndpoint, HandshakeValues } from "./AbstractClientWsEndpoint"
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export default class BrowserClientWsEndpoint extends AbstractClientWsEndpoint<BrowserClientWsConnection> {
    protected doConnect(serverUrl: string, serverPeerInfo: PeerInfo): Promise<PeerId> {
        return new Promise<PeerId>((resolve, reject) => {
            try {
                const ws = new w3cwebsocket(serverUrl)

                ws.onopen = () => {
                    this.handshakeInit(ws, serverPeerInfo, reject)
                }

                ws.onmessage = (message: IMessageEvent) => {
                    this.handshakeListener(ws, serverPeerInfo, serverUrl, message, resolve)
                }

                ws.onerror = (error) => {
                    this.onHandshakeError(serverUrl, error, reject)
                }

                ws.onclose = (event) => {
                    this.onHandshakeClosed(serverUrl, event.code, event.reason, reject)
                }

            } catch (err) {
                logger.trace('Failed to connect to server', { serverUrl, err })
                reject(err)
            }
        })
    }

    protected doSetUpConnection(ws: w3cwebsocket, serverPeerInfo: PeerInfo): BrowserClientWsConnection {
        const connection = BrowserWebSocketConnectionFactory.createConnection(ws, serverPeerInfo)

        ws.onmessage = (message) => {
            const parsedMsg = message.data.toString()
            if (parsedMsg === 'pong') {
                connection.onPong()
            } else {
                this.onReceive(connection, parsedMsg)
            }
        }

        ws.onclose = (event) => {
            this.onClose(connection, event.code, event.reason as DisconnectionReason)
            if (event.code === DisconnectionCode.DUPLICATE_SOCKET) {
                logger.warn('Refused connection (Duplicate nodeId detected, are you running multiple nodes with the same private key?)')
            } else if (event.code === DisconnectionCode.INVALID_PROTOCOL_MESSAGE) {
                logger.warn('Refused connection (Invalid protocol message format detected, are you running an outdated version?)')
            }
        }

        ws.onerror = (error) => {
            this.ongoingConnectionError(serverPeerInfo.peerId, error, connection)
        }

        return connection
    }

    // eslint-disable-next-line class-methods-use-this
    protected doHandshakeResponse(uuid: string, _peerId: PeerId, ws: w3cwebsocket): void {
        ws.send(JSON.stringify({ uuid, peerId: this.peerInfo.peerId }))
    }

    // eslint-disable-next-line class-methods-use-this
    protected doHandshakeParse(message: IMessageEvent): HandshakeValues {
        const { uuid, peerId } = JSON.parse(message.data.toString())
        return {
            uuid,
            peerId
        }
    }

}
