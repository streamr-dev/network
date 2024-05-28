import { WebsocketClientConnection } from './NodeWebsocketClientConnection'
import { ConnectionType } from '../IConnection'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { WebsocketClientConnectorRpcLocal } from './WebsocketClientConnectorRpcLocal'
import {
    ConnectivityMethod,
    PeerDescriptor,
    WebsocketConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { ManagedConnection } from '../ManagedConnection'
import { WebsocketServer } from './WebsocketServer'
import { createOutgoingHandshaker } from '../Handshaker'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { expectedConnectionType } from '../../helpers/Connectivity'
import { Empty } from '../../proto/google/protobuf/empty'
import { DhtAddress, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { GeoIpLocator } from '@streamr/geoip-location'

export type Action = 'connectivityRequest' | 'connectivityProbe'

export const connectivityMethodToWebsocketUrl = (ws: ConnectivityMethod, action?: Action): string => {
    return (ws.tls ? 'wss://' : 'ws://') + ws.host + ':' + ws.port + ((action !== undefined) ? '?action=' + action : '')
}

export interface WebsocketClientConnectorConfig {
    transport: ITransport
    onNewConnection: (connection: ManagedConnection) => boolean
    hasConnection: (nodeId: DhtAddress) => boolean
}

export class WebsocketClientConnector {

    public static readonly WEBSOCKET_CONNECTOR_SERVICE_ID = 'system/websocket-connector'
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly websocketServer?: WebsocketServer
    private geoIpLocator?: GeoIpLocator
    private readonly ongoingConnectRequests: Map<DhtAddress, ManagedConnection> = new Map()

    private localPeerDescriptor?: PeerDescriptor
    private connectingConnections: Map<DhtAddress, ManagedConnection> = new Map()
    private abortController = new AbortController()
    private readonly config: WebsocketClientConnectorConfig

    constructor(config: WebsocketClientConnectorConfig) {
        this.config = config
        this.rpcCommunicator = new ListeningRpcCommunicator(WebsocketClientConnector.WEBSOCKET_CONNECTOR_SERVICE_ID, config.transport, {
            rpcRequestTimeout: 15000  // TODO use config option or named constant?
        })
        this.registerLocalRpcMethods()
    }

    private registerLocalRpcMethods() {
        const rpcLocal = new WebsocketClientConnectorRpcLocal({
            connect: (targetPeerDescriptor: PeerDescriptor) => this.connect(targetPeerDescriptor),
            hasConnection: (nodeId: DhtAddress): boolean => (this.connectingConnections.has(nodeId)
                || this.ongoingConnectRequests.has(nodeId)
                || this.config.hasConnection(nodeId))
            ,
            onNewConnection: (connection: ManagedConnection) => this.config.onNewConnection(connection),
            abortSignal: this.abortController.signal
        })
        this.rpcCommunicator.registerRpcNotification(
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

    public connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        const nodeId = getNodeIdFromPeerDescriptor(targetPeerDescriptor)
        const existingConnection = this.connectingConnections.get(nodeId)
        if (existingConnection) {
            return existingConnection
        }
        const socket = new WebsocketClientConnection()

        const url = connectivityMethodToWebsocketUrl(targetPeerDescriptor.websocket!)

        const managedConnection = new ManagedConnection(ConnectionType.WEBSOCKET_CLIENT)
        managedConnection.setRemotePeerDescriptor(targetPeerDescriptor)
        createOutgoingHandshaker(this.localPeerDescriptor!, managedConnection, socket, targetPeerDescriptor)
        this.connectingConnections.set(nodeId, managedConnection)

        const delFunc = () => {
            if (this.connectingConnections.has(nodeId)) {
                this.connectingConnections.delete(nodeId)
            }
            socket.off('disconnected', delFunc)
            managedConnection.off('disconnected', delFunc)
            managedConnection.off('connected', delFunc)
        }
        socket.on('disconnected', delFunc)
        managedConnection.on('disconnected', delFunc)
        managedConnection.on('connected', delFunc)

        socket.connect(url, false)

        return managedConnection
    }
    
    public setLocalPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.localPeerDescriptor = peerDescriptor
    }

    public async destroy(): Promise<void> {
        this.abortController.abort()
        this.rpcCommunicator.destroy()

        const requests = Array.from(this.ongoingConnectRequests.values())
        await Promise.allSettled(requests.map((conn) => conn.close(true)))

        await this.websocketServer?.stop()
        await this.geoIpLocator?.stop()
    }
}
