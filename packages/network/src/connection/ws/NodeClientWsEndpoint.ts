import WebSocket from 'ws'
import { PeerId, PeerInfo } from '../PeerInfo'
import { MetricsContext } from '../../helpers/MetricsContext'
import { DisconnectionCode, DisconnectionReason } from "./AbstractWsEndpoint"
import { NodeClientWsConnection, NodeWebSocketConnectionFactory } from './NodeClientWsConnection'
import { AbstractClientWsEndpoint, HandshakeValues, ServerUrl } from "./AbstractClientWsEndpoint"

export default class NodeClientWsEndpoint extends AbstractClientWsEndpoint<NodeClientWsConnection> {
    constructor(
        peerInfo: PeerInfo,
        metricsContext?: MetricsContext,
        pingInterval?: number
    ) {
        super(peerInfo, metricsContext, pingInterval)
    }

    protected doConnect(serverUrl: ServerUrl, serverPeerInfo: PeerInfo): Promise<PeerId> {
        return new Promise<PeerId>((resolve, reject) => {
            try {
                const ws = new WebSocket(`${serverUrl}/ws`)

                ws.once('open', () => {
                    this.handshakeInit(ws, serverPeerInfo, reject)
                })

                ws.on('message', (message: string | Buffer | Buffer[]) => {
                    this.handshakeListener(ws, serverPeerInfo, serverUrl, message, resolve)
                })

                ws.on('close', (code: number, reason: string): void => {
                    this.onHandshakeClosed(serverUrl, code, reason, reject)
                })

                ws.on('error', (err) => {
                    this.onHandshakeError(serverUrl, err, reject)
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
            if (code === DisconnectionCode.DUPLICATE_SOCKET) {
                this.logger.warn('Connection refused: Duplicate nodeId detected, are you running multiple nodes with the same private key?')
            } if (code === DisconnectionCode.VERSION_CONFICT) {
                this.logger.warn('Connection refused: Version conflict detected, are you running an outdated version?')
            }
        })

        ws.on('error', (err) => {
            this.ongoingConnectionError(serverPeerInfo.peerId, err, connection)
        })

        return connection
    }

    protected doHandshakeResponse(uuid: string, peerId: PeerId, ws: WebSocket): void {
        ws.send(JSON.stringify({ uuid, peerId: this.peerInfo.peerId }))
    }

    protected doHandshakeParse(message: string | Buffer | Buffer[]): HandshakeValues {
        const { uuid, peerId } = JSON.parse(message.toString())
        return {
            uuid,
            peerId
        }
    }
}