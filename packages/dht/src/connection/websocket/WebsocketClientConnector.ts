import { WebsocketClientConnection } from './NodeWebsocketClientConnection'
import { ConnectionType } from '../IConnection'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { WebsocketClientConnectorRpcLocal } from './WebsocketClientConnectorRpcLocal'
import {
    ConnectivityMethod,
    PeerDescriptor,
    WebsocketConnectionRequest
} from '../../../generated/packages/dht/protos/DhtRpc'
import { WebsocketServer } from './WebsocketServer'
import { createOutgoingHandshaker } from '../Handshaker'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { expectedConnectionType } from '../../helpers/Connectivity'
import { Empty } from '../../../generated/google/protobuf/empty'
import { DhtAddress, toNodeId } from '../../identifiers'
import { GeoIpLocator } from '@streamr/geoip-location'
import { PendingConnection } from '../PendingConnection'

export type Action = 'connectivityRequest' | 'connectivityProbe'

export const connectivityMethodToWebsocketUrl = (ws: ConnectivityMethod, action?: Action): string => {
    return (ws.tls ? 'wss://' : 'ws://') + ws.host + ':' + ws.port + (action !== undefined ? '?action=' + action : '')
}

export interface WebsocketClientConnectorOptions {
    onNewConnection: (connection: PendingConnection) => boolean
    hasConnection: (nodeId: DhtAddress) => boolean
    rpcCommunicator: ListeningRpcCommunicator
}

export class WebsocketClientConnector {
    public static readonly WEBSOCKET_CONNECTOR_SERVICE_ID = 'system/websocket-connector'
    private readonly websocketServer?: WebsocketServer
    private geoIpLocator?: GeoIpLocator

    private localPeerDescriptor?: PeerDescriptor
    private connectingConnections: Map<DhtAddress, PendingConnection> = new Map()
    private abortController = new AbortController()
    private readonly options: WebsocketClientConnectorOptions

    constructor(options: WebsocketClientConnectorOptions) {
        this.options = options

        this.registerLocalRpcMethods()
    }

    private registerLocalRpcMethods() {
        const rpcLocal = new WebsocketClientConnectorRpcLocal({
            connect: (targetPeerDescriptor: PeerDescriptor) => this.connect(targetPeerDescriptor),
            hasConnection: (nodeId: DhtAddress): boolean =>
                this.connectingConnections.has(nodeId) || this.options.hasConnection(nodeId),
            onNewConnection: (connection: PendingConnection) => this.options.onNewConnection(connection),
            abortSignal: this.abortController.signal
        })
        this.options.rpcCommunicator.registerRpcNotification(
            WebsocketConnectionRequest,
            'requestConnection',
            async (req: WebsocketConnectionRequest, context: ServerCallContext): Promise<Empty> => {
                if (!this.abortController.signal.aborted) {
                    return rpcLocal.requestConnection(req, context)
                } else {
                    return {}
                }
            }
        )
    }

    public isPossibleToFormConnection(targetPeerDescriptor: PeerDescriptor): boolean {
        const connectionType = expectedConnectionType(this.localPeerDescriptor!, targetPeerDescriptor)
        return connectionType === ConnectionType.WEBSOCKET_CLIENT
    }

    public connect(targetPeerDescriptor: PeerDescriptor): PendingConnection {
        const nodeId = toNodeId(targetPeerDescriptor)
        const existingConnection = this.connectingConnections.get(nodeId)
        if (existingConnection) {
            return existingConnection
        }
        const socket = new WebsocketClientConnection()

        const url = connectivityMethodToWebsocketUrl(targetPeerDescriptor.websocket!)

        const pendingConnection = new PendingConnection(targetPeerDescriptor)
        createOutgoingHandshaker(this.localPeerDescriptor!, pendingConnection, socket, targetPeerDescriptor)
        this.connectingConnections.set(nodeId, pendingConnection)

        const delFunc = () => {
            if (this.connectingConnections.has(nodeId)) {
                this.connectingConnections.delete(nodeId)
            }
            socket.off('disconnected', delFunc)
            pendingConnection.off('disconnected', delFunc)
            pendingConnection.off('connected', delFunc)
        }
        socket.on('disconnected', delFunc)
        pendingConnection.on('disconnected', delFunc)
        pendingConnection.on('connected', delFunc)

        socket.connect(url, false)

        return pendingConnection
    }

    public setLocalPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.localPeerDescriptor = peerDescriptor
    }

    public async destroy(): Promise<void> {
        this.abortController.abort()

        const requests = Array.from(this.connectingConnections.values())
        await Promise.allSettled(requests.map((conn) => conn.close(true)))

        await this.websocketServer?.stop()
        this.geoIpLocator?.stop()
    }
}
