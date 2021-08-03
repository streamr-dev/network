import { IMessageEvent, w3cwebsocket } from 'websocket'
import { PeerInfo } from '../PeerInfo'
import { MetricsContext } from '../../helpers/MetricsContext'
import { DisconnectionCode, DisconnectionReason } from "./AbstractWsEndpoint"
import { BrowserClientWsConnection, BrowserWebSocketConnectionFactory } from './BrowserClientWsConnection'
import { AbstractClientWsEndpoint, HandshakeValues, PeerId } from "./AbstractClientWsEndpoint"

export default class BrowserClientWsEndpoint extends AbstractClientWsEndpoint<BrowserClientWsConnection> {
    constructor(
        peerInfo: PeerInfo,
        metricsContext?: MetricsContext,
        pingInterval?: number
    ) {
        super(peerInfo, metricsContext, pingInterval)
    }

    protected doConnect(serverUrl: string, serverPeerInfo: PeerInfo): Promise<string> {
        return new Promise<string>((resolve, reject) => {
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
                this.metrics.record('open:failedException', 1)
                this.logger.trace('failed to connect to %s, error: %o', serverUrl, err)
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
        }

        ws.onerror = (error) => {
            this.ongoingConnectionError(serverPeerInfo.peerId, error, connection)
        }

        return connection
    }

    protected doHandshakeResponse(uuid: string, peerId: string, ws: w3cwebsocket): void {
        ws.send(JSON.stringify({ uuid, peerId: this.peerInfo.peerId }))
    }

    protected doHandshakeParse(message: IMessageEvent): HandshakeValues {
        const { uuid, peerId } = JSON.parse(message.data.toString())
        return {
            uuid,
            peerId
        }
    }

}
