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
type ServerUrlByPeerId = { [key: string]: ServerUrl }
type ConnectionsByServerUrl = { [key: string]: BrowserClientWsConnection }
type PendingConnections = { [key: string]: Promise<string> }

export class BrowserClientWsEndpoint extends AbstractWsEndpoint<BrowserClientWsConnection> {
    private readonly connectionsByServerUrl: ConnectionsByServerUrl
    private readonly serverUrlByPeerId: ServerUrlByPeerId
    private readonly pendingConnections: PendingConnections
    private trackerIdReceivedTimeoutRef: NodeJS.Timeout | null
    constructor(
        peerInfo: PeerInfo,
        metricsContext?: MetricsContext,
        pingInterval?: number
    ) {
        super(peerInfo, metricsContext, pingInterval)

        this.connectionsByServerUrl = {}
        this.serverUrlByPeerId = {}
        this.pendingConnections = {}
        this.trackerIdReceivedTimeoutRef = null
        this.metrics.addQueriedMetric('pendingConnections', () => Object.keys(this.pendingConnections).length)
    }

    connect(serverUrl: ServerUrl, serverPeerInfo: PeerInfo): Promise<PeerId> {
        // Check for existing connection and its state
        const existingConnection = this.connectionsByServerUrl[serverUrl]
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
        const pendingConnection = this.pendingConnections[serverUrl]
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
            delete this.pendingConnections[serverUrl]
        })

        this.pendingConnections[serverUrl] = p
        return p
    }

    getServerUrlByPeerId(peerId: PeerId): string | undefined {
        return this.serverUrlByPeerId[peerId]
    }

    protected doClose(connection: BrowserClientWsConnection, _code: DisconnectionCode, _reason: DisconnectionReason): void {
        console.log("WHY?", _reason)
        const serverUrl = this.serverUrlByPeerId[connection.getPeerId()]!
        delete this.connectionsByServerUrl[serverUrl]
        delete this.serverUrlByPeerId[connection.getPeerId()]
    }

    protected async doStop(): Promise<void> {
        if (this.trackerIdReceivedTimeoutRef) {
            clearTimeout(this.trackerIdReceivedTimeoutRef)
        }
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
            console.log("CLOSED")
            this.onClose(connection, event.code, event.reason as DisconnectionReason)
        }
        this.connectionsByServerUrl[serverUrl] = connection
        this.serverUrlByPeerId[connection.getPeerId()] =  serverUrl
        this.onNewConnection(connection)
        console.log("getPeers", this.getPeers())
        return connection.getPeerId()
    }
}