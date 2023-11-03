import { ClientWebsocket } from './ClientWebsocket'
import { IConnection, ConnectionType } from '../IConnection'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { WebsocketConnectorRpcRemote } from './WebsocketConnectorRpcRemote'
import {
    ConnectivityMethod,
    ConnectivityResponse,
    NodeType,
    PeerDescriptor,
    WebsocketConnectionRequest,
    WebsocketConnectionResponse
} from '../../proto/packages/dht/protos/DhtRpc'
import { WebsocketConnectorRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { Logger, binaryToHex, wait } from '@streamr/utils'
import { IWebsocketConnectorRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { ManagedConnection } from '../ManagedConnection'
import { WebsocketServer } from './WebsocketServer'
import { ConnectivityChecker } from '../ConnectivityChecker'
import { NatType, PortRange, TlsCertificate } from '../ConnectionManager'
import { PeerIDKey } from '../../helpers/PeerID'
import { ServerWebsocket } from './ServerWebsocket'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { Handshaker } from '../Handshaker'
import { keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { ParsedUrlQuery } from 'querystring'
import { range, sample } from 'lodash'
import { isPrivateIPv4 } from '../../helpers/AddressTools'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'

const logger = new Logger(module)

export const connectivityMethodToWebsocketUrl = (ws: ConnectivityMethod): string => {
    return (ws.tls ? 'wss://' : 'ws://') + ws.host + ':' + ws.port
}

const canOpenConnectionFromBrowser = (websocketServer: ConnectivityMethod) => {
    const hasPrivateAddress = ((websocketServer.host === 'localhost') || isPrivateIPv4(websocketServer.host))
    return websocketServer.tls || hasPrivateAddress
}

const ENTRY_POINT_CONNECTION_ATTEMPTS = 5

interface WebsocketConnectorRpcLocalConfig {
    transport: ITransport
    canConnect: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean
    onIncomingConnection: (connection: ManagedConnection) => boolean
    portRange?: PortRange
    maxMessageSize?: number
    host?: string
    entrypoints?: PeerDescriptor[]
    tlsCertificate?: TlsCertificate
}

export class WebsocketConnectorRpcLocal implements IWebsocketConnectorRpc {

    private static readonly WEBSOCKET_CONNECTOR_SERVICE_ID = 'system/websocket-connector'
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly canConnectFunction: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean
    private readonly websocketServer?: WebsocketServer
    private connectivityChecker?: ConnectivityChecker
    private readonly ongoingConnectRequests: Map<PeerIDKey, ManagedConnection> = new Map()
    private onIncomingConnection: (connection: ManagedConnection) => boolean
    private host?: string
    private readonly entrypoints?: PeerDescriptor[]
    private readonly tlsCertificate?: TlsCertificate
    private selectedPort?: number
    private localPeerDescriptor?: PeerDescriptor
    private connectingConnections: Map<PeerIDKey, ManagedConnection> = new Map()
    private destroyed = false

    constructor(config: WebsocketConnectorRpcLocalConfig) {
        this.websocketServer = config.portRange ? new WebsocketServer({
            portRange: config.portRange!,
            tlsCertificate: config.tlsCertificate,
            maxMessageSize: config.maxMessageSize
        }) : undefined
        this.onIncomingConnection = config.onIncomingConnection
        this.host = config.host
        this.entrypoints = config.entrypoints
        this.tlsCertificate = config.tlsCertificate

        this.canConnectFunction = config.canConnect.bind(this)

        this.rpcCommunicator = new ListeningRpcCommunicator(WebsocketConnectorRpcLocal.WEBSOCKET_CONNECTOR_SERVICE_ID, config.transport, {
            rpcRequestTimeout: 15000
        })

        this.rpcCommunicator.registerRpcMethod(
            WebsocketConnectionRequest,
            WebsocketConnectionResponse,
            'requestConnection',
            (req: WebsocketConnectionRequest, context: ServerCallContext) => this.requestConnection(req, context)
        )
    }

    private attachHandshaker(connection: IConnection) {
        const handshaker = new Handshaker(this.localPeerDescriptor!, connection)
        handshaker.once('handshakeRequest', (peerDescriptor: PeerDescriptor) => {
            this.onServerSocketHandshakeRequest(peerDescriptor, connection)
        })
    }

    public async start(): Promise<void> {
        if (!this.destroyed && this.websocketServer) {
            this.websocketServer.on('connected', (connection: IConnection) => {

                const serverSocket = connection as unknown as ServerWebsocket
                if (serverSocket.resourceURL &&
                    serverSocket.resourceURL.query) {
                    const query = serverSocket.resourceURL.query as unknown as ParsedUrlQuery
                    if (query.connectivityRequest) {
                        logger.trace('Received connectivity request connection from ' + serverSocket.getRemoteAddress())
                        this.connectivityChecker!.listenToIncomingConnectivityRequests(serverSocket)
                    } else if (query.connectivityProbe) {
                        logger.trace('Received connectivity probe connection from ' + serverSocket.getRemoteAddress())
                    } else {
                        this.attachHandshaker(connection)
                    }
                } else {
                    this.attachHandshaker(connection)
                }
            })
            const port = await this.websocketServer.start()
            this.selectedPort = port
            this.connectivityChecker = new ConnectivityChecker(this.selectedPort, this.tlsCertificate !== undefined, this.host)
        }
    }

    public async checkConnectivity(): Promise<ConnectivityResponse> {
        // TODO: this could throw if the server is not running
        const noServerConnectivityResponse: ConnectivityResponse = {
            host: '127.0.0.1',
            natType: NatType.UNKNOWN
        }
        if (this.destroyed) {
            return noServerConnectivityResponse
        }
        for (const reattempt of range(ENTRY_POINT_CONNECTION_ATTEMPTS)) {
            const entryPoint = sample(this.entrypoints)!
            try {
                if (!this.websocketServer) {
                    return noServerConnectivityResponse
                } else {
                    if (!this.entrypoints || this.entrypoints.length < 1) {
                        // return connectivity info given in config
                        const preconfiguredConnectivityResponse: ConnectivityResponse = {
                            host: this.host!,
                            natType: NatType.OPEN_INTERNET,
                            websocket: { host: this.host!, port: this.selectedPort!, tls: this.tlsCertificate !== undefined }
                        }
                        return preconfiguredConnectivityResponse
                    } else {
                        // Do real connectivity checking
                        return await this.connectivityChecker!.sendConnectivityRequest(entryPoint)
                    }
                }
            } catch (err) {
                if (reattempt < ENTRY_POINT_CONNECTION_ATTEMPTS) {
                    const error = `Failed to connect to entrypoint with id ${binaryToHex(entryPoint.kademliaId)} `
                        + `and URL ${connectivityMethodToWebsocketUrl(entryPoint.websocket!)}`
                    logger.error(error, { error: err })
                    await wait(2000)
                }
            }
        }
        throw Error(`Failed to connect to the entrypoints after ${ENTRY_POINT_CONNECTION_ATTEMPTS} attempts`)
    }

    public isPossibleToFormConnection(targetPeerDescriptor: PeerDescriptor): boolean {
        if (this.localPeerDescriptor!.websocket !== undefined) {
            return (targetPeerDescriptor.type !== NodeType.BROWSER) || canOpenConnectionFromBrowser(this.localPeerDescriptor!.websocket)
        } else if (targetPeerDescriptor.websocket !== undefined) {
            return (this.localPeerDescriptor!.type !== NodeType.BROWSER) || canOpenConnectionFromBrowser(targetPeerDescriptor.websocket)
        } else {
            return false
        }
    }

    public connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        const peerKey = keyFromPeerDescriptor(targetPeerDescriptor)
        const existingConnection = this.connectingConnections.get(peerKey)
        if (existingConnection) {
            return existingConnection
        }

        if (this.localPeerDescriptor!.websocket && !targetPeerDescriptor.websocket) {
            return this.requestConnectionFromPeer(this.localPeerDescriptor!, targetPeerDescriptor)
        } else {
            const socket = new ClientWebsocket()

            const url = connectivityMethodToWebsocketUrl(targetPeerDescriptor.websocket!)

            const managedConnection = new ManagedConnection(this.localPeerDescriptor!, ConnectionType.WEBSOCKET_CLIENT, socket, undefined)
            managedConnection.setPeerDescriptor(targetPeerDescriptor)

            this.connectingConnections.set(keyFromPeerDescriptor(targetPeerDescriptor), managedConnection)

            const delFunc = () => {
                if (this.connectingConnections.has(peerKey)) {
                    this.connectingConnections.delete(peerKey)
                }
                socket.off('disconnected', delFunc)
                managedConnection.off('handshakeCompleted', delFunc)
            }
            socket.on('disconnected', delFunc)
            managedConnection.on('handshakeCompleted', delFunc)

            socket.connect(url)

            return managedConnection
        }
    }

    private requestConnectionFromPeer(localPeerDescriptor: PeerDescriptor, targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        setImmediate(() => {
            const remoteConnector = new WebsocketConnectorRpcRemote(
                localPeerDescriptor,
                targetPeerDescriptor,
                toProtoRpcClient(new WebsocketConnectorRpcClient(this.rpcCommunicator.getRpcClientTransport()))
            )
            remoteConnector.requestConnection(localPeerDescriptor.websocket!.host, localPeerDescriptor.websocket!.port)
        })
        const managedConnection = new ManagedConnection(this.localPeerDescriptor!, ConnectionType.WEBSOCKET_SERVER)
        managedConnection.on('disconnected', () => this.ongoingConnectRequests.delete(keyFromPeerDescriptor(targetPeerDescriptor)))
        managedConnection.setPeerDescriptor(targetPeerDescriptor)
        this.ongoingConnectRequests.set(keyFromPeerDescriptor(targetPeerDescriptor), managedConnection)
        return managedConnection
    }

    private onServerSocketHandshakeRequest = (peerDescriptor: PeerDescriptor, serverWebsocket: IConnection) => {

        const peerId = peerIdFromPeerDescriptor(peerDescriptor)

        if (this.ongoingConnectRequests.has(peerId.toKey())) {
            const ongoingConnectReguest = this.ongoingConnectRequests.get(peerId.toKey())!
            ongoingConnectReguest.attachImplementation(serverWebsocket)
            ongoingConnectReguest.acceptHandshake()
            this.ongoingConnectRequests.delete(peerId.toKey())
        } else {
            const managedConnection = new ManagedConnection(this.localPeerDescriptor!, ConnectionType.WEBSOCKET_SERVER, undefined, serverWebsocket)

            managedConnection.setPeerDescriptor(peerDescriptor)

            if (this.onIncomingConnection(managedConnection)) {
                managedConnection.acceptHandshake()
            } else {
                managedConnection.rejectHandshake('Duplicate connection')
                managedConnection.destroy()
            }
        }
    }

    public setLocalPeerDescriptor(localPeerDescriptor: PeerDescriptor): void {
        this.localPeerDescriptor = localPeerDescriptor
    }

    public async destroy(): Promise<void> {
        this.destroyed = true
        this.rpcCommunicator.stop()

        const requests = Array.from(this.ongoingConnectRequests.values())
        await Promise.allSettled(requests.map((conn) => conn.close('OTHER')))

        const attempts = Array.from(this.connectingConnections.values())
        await Promise.allSettled(attempts.map((conn) => conn.close('OTHER')))
        this.connectivityChecker?.destroy()
        await this.websocketServer?.stop()
    }

    // IWebsocketConnectorRpc implementation
    public async requestConnection(request: WebsocketConnectionRequest, context: ServerCallContext): Promise<WebsocketConnectionResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        if (!this.destroyed && this.canConnectFunction(senderPeerDescriptor, request.ip, request.port)) {
            setImmediate(() => {
                if (this.destroyed) {
                    return
                }
                const connection = this.connect(senderPeerDescriptor)
                this.onIncomingConnection(connection)
            })
            const res: WebsocketConnectionResponse = {
                accepted: true
            }
            return res
        }
        return {
            accepted: false
        }
    }
}
