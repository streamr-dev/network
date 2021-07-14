import { w3cwebsocket } from 'websocket'
import { PeerInfo } from '../PeerInfo'
import { MetricsContext } from '../../helpers/MetricsContext'
import { DisconnectionCode, DisconnectionReason } from "./AbstractWsEndpoint"
import { BrowserClientWsConnection, BrowserWebSocketConnectionFactory } from './BrowserClientWsConnection'
import { AbstractClientWsEndpoint, PeerId } from "./AbstractClientWsEndpoint"

export default class BrowserClientWsEndpoint extends AbstractClientWsEndpoint<BrowserClientWsConnection> {
    constructor(
        peerInfo: PeerInfo,
        metricsContext?: MetricsContext,
        pingInterval?: number
    ) {
        super(peerInfo, metricsContext, pingInterval)
    }

    getServerUrlByPeerId(peerId: PeerId): string | undefined {
        return this.serverUrlByPeerId.get(peerId)
    }

    protected doClose(connection: BrowserClientWsConnection, _code: DisconnectionCode, _reason: DisconnectionReason): void {
        const serverUrl = this.serverUrlByPeerId.get(connection.getPeerId())!
        this.connectionsByServerUrl.delete(serverUrl)
        this.serverUrlByPeerId.delete(connection.getPeerId())
    }

    protected async doStop(): Promise<void> {
        this.getConnections().forEach((connection) => {
            connection.close(DisconnectionCode.GRACEFUL_SHUTDOWN, DisconnectionReason.GRACEFUL_SHUTDOWN)
        })
    }

    protected doConnect(serverUrl: string, serverPeerInfo: PeerInfo): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            try {
                const ws = new w3cwebsocket(
                    serverUrl,
                    undefined,
                    undefined,
                    undefined,
                    undefined
                )
                let connection: BrowserClientWsConnection | undefined

                ws.onopen = () => {
                    const peerId = serverPeerInfo.peerId
                    this.handshakeTimeoutRefs[peerId] = setTimeout(() => {
                        ws.close(DisconnectionCode.FAILED_HANDSHAKE, `Handshake not received from ${peerId}`)
                        delete this.handshakeTimeoutRefs[peerId]
                        reject(`Handshake not received from ${peerId}`)
                    }, this.handshakeTimer)
                }

                ws.onmessage = (message) => {
                    try {
                        const { uuid, peerId } = JSON.parse(message.data.toString())
                        if (uuid && peerId === serverPeerInfo.peerId) {
                            ws.send(JSON.stringify({uuid, peerId: this.peerInfo.peerId}))
                            resolve(this.setUpConnection(ws, serverPeerInfo, serverUrl))
                        } else {
                            this.logger.trace('Expected a handshake message got: ' + message.data.toString())
                        }
                    } catch (err) {
                        this.logger.trace(err)
                    }
                }

                ws.onerror = (error) => {
                    this.metrics.record('webSocketError', 1)
                    this.logger.trace('failed to connect to %s, error: %o', serverUrl, error)
                    connection?.terminate()
                    reject(error)
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
        return connection
    }

}