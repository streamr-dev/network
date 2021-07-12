import { w3cwebsocket } from 'websocket'
import { PeerInfo } from '../PeerInfo'
import { MetricsContext } from '../../helpers/MetricsContext'
import { AbstractWsEndpoint, DisconnectionCode, DisconnectionReason } from "./AbstractWsEndpoint"
import { BrowserClientWsConnection } from './BrowserClientWsConnection'

function toHeaders(peerInfo: PeerInfo): { [key: string]: string } {
    return {
        [AbstractWsEndpoint.PEER_ID_HEADER]: peerInfo.peerId
    }
}

type PeerId = string
type ServerUrl = string

export class BrowserClientWsEndpoint extends AbstractWsEndpoint<BrowserClientWsConnection> {
    private readonly connectionsByServerUrl: Map<ServerUrl, BrowserClientWsConnection>
    private readonly serverUrlByPeerId: Map<PeerId, ServerUrl>
    private readonly pendingConnections: Map<ServerUrl, Promise<string>>
    constructor(
        peerInfo: PeerInfo,
        metricsContext?: MetricsContext,
        pingInterval?: number
    ) {
        super(peerInfo, metricsContext, pingInterval)

        this.connectionsByServerUrl = new Map()
        this.serverUrlByPeerId = new Map()
        this.pendingConnections = new Map()
        this.metrics.addQueriedMetric('pendingConnections', () => Object.keys(this.pendingConnections).length)
    }

    connect(serverUrl: ServerUrl, serverPeerInfo: PeerInfo): Promise<PeerId> {
        // Check for existing connection and its state
        const existingConnection = this.connectionsByServerUrl.get(serverUrl)
        if (existingConnection !== undefined) {
            if (existingConnection.getReadyState() === w3cwebsocket.OPEN) {
                return Promise.resolve(existingConnection.getPeerId())
            }
            this.logger.trace('supposedly connected to %s but readyState is %s, closing connection',
                serverUrl,
                existingConnection.getReadyState()
            )
            this.close(
                existingConnection.getPeerId(),
                DisconnectionCode.DEAD_CONNECTION,
                DisconnectionReason.DEAD_CONNECTION
            )
        }

        // Check for pending connection
        const pendingConnection = this.pendingConnections.get(serverUrl)
        if (pendingConnection !== undefined) {
            return pendingConnection
        }

        // Perform connection
        this.logger.trace('connecting to %s', serverUrl)
        const p = new Promise<string>((resolve, reject) => {
            try {
                const ws = new w3cwebsocket(
                    `${serverUrl}/ws?peerInfo=${this.peerInfo.peerId}`,
                    undefined,
                    undefined,
                    toHeaders(this.peerInfo),
                )
                let connection: BrowserClientWsConnection | undefined

                ws.onopen = () => {
                    resolve(this.setUpConnection(ws, serverPeerInfo, serverUrl))
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
        }).finally(() => {
            this.pendingConnections.delete(serverUrl)
        })

        this.pendingConnections.set(serverUrl, p)
        return p
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

    private setUpConnection(ws: w3cwebsocket, serverPeerInfo: PeerInfo, serverUrl: ServerUrl): PeerId {
        const connection = new BrowserClientWsConnection(ws, serverPeerInfo)
        ws.onmessage = (message) => {
            const parsedMsg = message.toString()
            console.log(parsedMsg)
            if (parsedMsg === 'ping') {
                console.log('PING RECEIVED')
            }
            this.onReceive(connection, parsedMsg)
        }

        ws.onclose = (event) => {
            this.onClose(connection, event.code, event.reason as DisconnectionReason)
        }
        this.connectionsByServerUrl.set(serverUrl, connection)
        this.serverUrlByPeerId.set(connection.getPeerId(), serverUrl)
        this.onNewConnection(connection)
        return connection.getPeerId()
    }
}