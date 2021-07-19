import WebSocket from 'ws'
import { PeerInfo } from '../PeerInfo'
import { MetricsContext } from '../../helpers/MetricsContext'
import { DisconnectionCode, DisconnectionReason } from "./AbstractWsEndpoint"
import { NodeClientWsConnection, NodeWebSocketConnectionFactory } from './NodeClientWsConnection'
import { AbstractClientWsEndpoint, PeerId, ServerUrl } from "./AbstractClientWsEndpoint"

export default class NodeClientWsEndpoint extends AbstractClientWsEndpoint<NodeClientWsConnection> {
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

    protected doClose(connection: NodeClientWsConnection, _code: DisconnectionCode, _reason: DisconnectionReason): void {
        const serverUrl = this.serverUrlByPeerId.get(connection.getPeerId())!
        this.connectionsByServerUrl.delete(serverUrl)
        this.serverUrlByPeerId.delete(connection.getPeerId())
    }

    protected async doStop(): Promise<void> {
        this.getConnections().forEach((connection) => {
            connection.close(DisconnectionCode.GRACEFUL_SHUTDOWN, DisconnectionReason.GRACEFUL_SHUTDOWN)
        })
    }

    protected doConnect(serverUrl: ServerUrl, serverPeerInfo: PeerInfo): Promise<PeerId> {
        return new Promise<string>((resolve, reject) => {
            try {
                const ws = new WebSocket(
                    `${serverUrl}/ws`
                )

                let connection: NodeClientWsConnection | undefined

                ws.on('message', (message: string | Buffer | Buffer[]) => {
                    try {
                        const {uuid, peerId} = JSON.parse(message.toString())
                        if (uuid && peerId === serverPeerInfo.peerId) {
                            ws.send(JSON.stringify({uuid, peerId: this.peerInfo.peerId}))
                            if (this.handshakeTimeoutRefs[peerId]) {
                                this.clearHandshake(peerId)
                            }
                            resolve(this.setUpConnection(ws, serverPeerInfo, serverUrl))
                        } else {
                            this.logger.trace('Expected a handshake message got: ' + message.toString())
                        }
                    } catch (err) {
                        this.logger.trace(err)
                    }
                })

                ws.on('close', (code: number, reason: string): void => {
                    this.logger.trace(code.toString(), reason)
                    ws.terminate()
                })

                ws.once('open', () => {
                    const peerId = serverPeerInfo.peerId
                    this.handshakeTimeoutRefs[peerId] = setTimeout(() => {
                        ws.close(DisconnectionCode.FAILED_HANDSHAKE, `Handshake not received from ${peerId}`)
                        this.logger.warn(`Handshake not received from ${peerId}`)
                        delete this.handshakeTimeoutRefs[peerId]
                        reject(`Handshake not received from ${peerId}`)
                    }, this.handshakeTimer)
                })

                ws.on('error', (err) => {
                    this.metrics.record('webSocketError', 1)
                    this.logger.warn('failed to connect to %s, error: %o', serverUrl, err)
                    connection?.terminate()
                    reject(err)
                })
            } catch (err) {
                this.metrics.record('open:failedException', 1)
                this.logger.trace('failed to connect to %s, error: %o', serverUrl, err)
                reject(err)
            }
        })
    }

    protected doSetUpConnection(ws: WebSocket, serverPeerInfo: PeerInfo): NodeClientWsConnection {
        const connection = NodeWebSocketConnectionFactory.createConnection(ws, serverPeerInfo)

        ws.on('message', (message: string | Buffer | Buffer[]) => {
            this.onReceive(connection, message.toString())
        })
        ws.on('pong', () => {
            connection.onPong()
        })
        ws.once('close', (code: number, reason: string): void => {
            this.onClose(connection, code, reason as DisconnectionReason)
        })

        return connection
    }
}