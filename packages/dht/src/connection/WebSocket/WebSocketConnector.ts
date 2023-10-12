import { ClientWebSocket } from './ClientWebSocket'
import { IConnection, ConnectionType } from '../IConnection'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { RemoteWebSocketConnector } from './RemoteWebSocketConnector'
import {
    ConnectivityMethod,
    ConnectivityResponse,
    PeerDescriptor,
    WebSocketConnectionRequest,
    WebSocketConnectionResponse
} from '../../proto/packages/dht/protos/DhtRpc'
import { WebSocketConnectorServiceClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { Logger, wait } from '@streamr/utils'
import { IWebSocketConnectorService } from '../../proto/packages/dht/protos/DhtRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { ManagedConnection } from '../ManagedConnection'
import { WebSocketServer } from './WebSocketServer'
import { ConnectivityChecker } from '../ConnectivityChecker'
import { NatType, PortRange, TlsCertificate } from '../ConnectionManager'
import { PeerIDKey } from '../../helpers/PeerID'
import { ServerWebSocket } from './ServerWebSocket'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { Handshaker } from '../Handshaker'
import { keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { ParsedUrlQuery } from 'querystring'
import { sample } from 'lodash'
import { AutoCertifierClient, AUTOCERTIFIER_SERVICE_ID, SessionIdRequest, SessionIdResponse } from '@streamr/autocertifier-client'
import { readFileSync } from 'fs'
import path from 'path'

const cert = '-----BEGIN CERTIFICATE----- MIIDlzCCAn+gAwIBAgIBATANBgkqhkiG9w0BAQsFADBvMQ4wDAYDVQQDEwVNeSBDQTELMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBGcmFuY2lzY28xEzARBgNVBAoTCk15IENvbXBhbnkxDjAMBgNVBAsTBU15IENBMCAXDTIzMTAwMzExMzQzMFoYDzIxMjMxMDAzMTEzNDMwWjBvMQ4wDAYDVQQDEwVNeSBDQTELMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBGcmFuY2lzY28xEzARBgNVBAoTCk15IENvbXBhbnkxDjAMBgNVBAsTBU15IENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAr2+dbqXfXutH20Lfr5y3zvLY+bB8/mni2LDEGoqi0BkJLJwauLUAS4Dsf/UYvsoMRSAA8L1ndn+o/gl95dgzGZDOHNmWrLSFpdSNO0ZbR4WGmgA2h0DhuE3FxX/xTD5qz3RmMx0v4u0tgt5u3pE/OSjXnH6ATccLeYgxITb+7a0rBRkBobrLxYVlrddLeWRV3880kSN4qINBfBZmSQ9SHa112YvC4VZwf/ggpCpeqcUdBzyr2UZl0sUbNe206icQeEaHMSUdW6a0Mdd0zMG6ApJGGwlO7b23DS+dDomne7rjiKrSztaxpsRMsLSTG/WximUELFYH65PtZXyBwlqqIQIDAQABozwwOjAMBgNVHRMEBTADAQH/MAsGA1UdDwQEAwIC9DAdBgNVHQ4EFgQUvBI/BHmUuwo4lCRdm6C17ehoL+4wDQYJKoZIhvcNAQELBQADggEBACFJYwUz42MbjvS+DLS/uGewMeVvlE+IAasU0vCquuhIzDQ3UPYK01pTrL3mD63J90BlaD1V1joZAuDlGZfTVaZSn2mdiO9qN51LMf+Mq/+QfnMnEmrCpzKrWgGe75D8glDsb+6MfTmS8eLwe+S6LE/MN0+jBEDucM5giA+NG3AHQZA/hMsH412T3OaecR8r4R+eEmzA83YB2UE4wbfIa+YafBIIsWdiRYsqS1HzwOA99Aq0Slh6cfFa1PMat4Ryd3u2EEYIH84GpMTNFZSsT+Gk1mPKkjPbdlpUz6ItIM9+bqZ6q0H+GAu9ohkQkHcgsYe26aDM77KBtYRe+ZXBfJM= -----END CERTIFICATE-----'
const logger = new Logger(module)

export const connectivityMethodToWebSocketUrl = (ws: ConnectivityMethod): string => {
    // return (ws.tls ? 'wss://' : 'ws://') + ws.host + ':' + ws.port
    return 'wss://' + ws.host + ':' + ws.port
}

const ENTRY_POINT_CONNECTION_ATTEMPTS = 5

export class WebSocketConnector implements IWebSocketConnectorService {
    private static readonly WEBSOCKET_CONNECTOR_SERVICE_ID = 'system/websocketconnector'
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly canConnectFunction: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean
    private readonly webSocketServer?: WebSocketServer
    private connectivityChecker?: ConnectivityChecker
    private readonly ongoingConnectRequests: Map<PeerIDKey, ManagedConnection> = new Map()
    private incomingConnectionCallback: (connection: ManagedConnection) => boolean
    private readonly autocertifierRpcCommunicator: ListeningRpcCommunicator
    private autocertifierClient?: AutoCertifierClient
    private portRange?: PortRange
    private host?: string
    private entrypoints?: PeerDescriptor[]
    private readonly tlsCertificate?: TlsCertificate
    private selectedPort?: number
    private readonly protocolVersion: string
    private ownPeerDescriptor?: PeerDescriptor
    private connectingConnections: Map<PeerIDKey, ManagedConnection> = new Map()
    private destroyed = false

    constructor(
        protocolVersion: string,
        rpcTransport: ITransport,
        fnCanConnect: (peerDescriptor: PeerDescriptor, _ip: string, port: number) => boolean,
        incomingConnectionCallback: (connection: ManagedConnection) => boolean,
        autocertifierRpcCommunicator: ListeningRpcCommunicator,
        portRange?: PortRange,
        host?: string,
        entrypoints?: PeerDescriptor[],
        tlsCertificate?: TlsCertificate
    ) {
        this.protocolVersion = protocolVersion
        this.webSocketServer = portRange ? new WebSocketServer() : undefined
        this.incomingConnectionCallback = incomingConnectionCallback
        this.portRange = portRange
        this.host = host
        this.entrypoints = entrypoints
        this.tlsCertificate = tlsCertificate
        this.autocertifierRpcCommunicator = autocertifierRpcCommunicator
        this.canConnectFunction = fnCanConnect.bind(this)

        this.rpcCommunicator = new ListeningRpcCommunicator(WebSocketConnector.WEBSOCKET_CONNECTOR_SERVICE_ID, rpcTransport, {
            rpcRequestTimeout: 15000
        })

        this.rpcCommunicator.registerRpcMethod(
            WebSocketConnectionRequest,
            WebSocketConnectionResponse,
            'requestConnection',
            (req: WebSocketConnectionRequest, context) => this.requestConnection(req, context)
        )
    }

    private attachHandshaker(connection: IConnection) {
        const handshaker = new Handshaker(this.ownPeerDescriptor!, this.protocolVersion, connection)
        handshaker.once('handshakeRequest', (peerDescriptor: PeerDescriptor) => {
            this.onServerSocketHandshakeRequest(peerDescriptor, connection)
        })
    }

    public async start(): Promise<void> {
        if (!this.destroyed && this.webSocketServer) {
            this.webSocketServer.on('connected', (connection: IConnection) => {

                const serverSocket = connection as unknown as ServerWebSocket
                if (serverSocket.resourceURL &&
                    serverSocket.resourceURL.query) {
                    const query = serverSocket.resourceURL.query as unknown as ParsedUrlQuery
                    if (query.connectivityRequest) {
                        logger.trace('Received connectivity request connection')
                        this.connectivityChecker!.listenToIncomingConnectivityRequests(serverSocket)
                    } else if (query.connectivityProbe) {
                        logger.trace('Received connectivity probe connection')
                    } else {
                        this.attachHandshaker(connection)
                    }
                } else {
                    this.attachHandshaker(connection)
                }
            })
            const port = await this.webSocketServer.start(this.portRange!, this.tlsCertificate)
            this.selectedPort = port
            this.connectivityChecker = new ConnectivityChecker(this.selectedPort, this.tlsCertificate !== undefined, this.host)
        }
    }

    public async checkConnectivity(reattempt = 0): Promise<ConnectivityResponse> {
        // TODO: this could throw if the server is not running
        const noServerConnectivityResponse: ConnectivityResponse = {
            openInternet: false,
            host: '127.0.0.1',
            natType: NatType.UNKNOWN
        }
        if (this.destroyed) {
            return noServerConnectivityResponse
        }
        try {
            if (!this.webSocketServer) {
                // If no websocket server, return openInternet: false
                return noServerConnectivityResponse
            } else {
                if (!this.entrypoints || this.entrypoints.length < 1) {
                    // return connectivity info given in config
                    const preconfiguredConnectivityResponse: ConnectivityResponse = {
                        openInternet: true,
                        host: this.host!,
                        natType: NatType.OPEN_INTERNET,
                        websocket: { host: this.host!, port: this.selectedPort!, tls: this.tlsCertificate !== undefined }
                    }
                    return preconfiguredConnectivityResponse
                } else {
                    // Do real connectivity checking
                    const passSelfSignedCa = this.ownPeerDescriptor ? this.webSocketServer!.getSelfSignedCertification()!.caCert : undefined
                    return await this.connectivityChecker!.sendConnectivityRequest(sample(this.entrypoints)!, passSelfSignedCa)
                }
            }
        } catch (err) {
            if (reattempt < ENTRY_POINT_CONNECTION_ATTEMPTS) {
                logger.error('Failed to connect to the entrypoint', { error: err })
                await wait(2000)
                return this.checkConnectivity(reattempt + 1)
            } else {
                throw err
            }
        }

    }

    public async autoCertify(): Promise<void> {
        if (this.selectedPort) {
            this.autocertifierClient = new AutoCertifierClient('~/subdomain.json', this.selectedPort!,
                'https://ns1.fe6a54d8-8d6f-4743-890d-e9ecd680a4c7.xyz:59833', cert, (_, rpcMethodName, method) => {
                    this.autocertifierRpcCommunicator.registerRpcMethod(
                        SessionIdRequest,
                        SessionIdResponse,
                        rpcMethodName,
                        method
                    )                        
                })
            this.autocertifierClient.on('updatedSubdomain', (subdomain) => {
                this.webSocketServer!.updateCertificate(subdomain.certificate)
            })
            await this.autocertifierClient.start()
        }
    }

    public connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        const peerKey = keyFromPeerDescriptor(targetPeerDescriptor)
        const existingConnection = this.connectingConnections.get(peerKey)
        if (existingConnection) {
            return existingConnection
        }

        if (this.ownPeerDescriptor!.websocket && !targetPeerDescriptor.websocket) {
            return this.requestConnectionFromPeer(this.ownPeerDescriptor!, targetPeerDescriptor)
        } else {
            const socket = new ClientWebSocket()

            const url = connectivityMethodToWebSocketUrl(targetPeerDescriptor.websocket!)

            const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion,
                ConnectionType.WEBSOCKET_CLIENT, socket, undefined)
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

    public requestConnectionFromPeer(ownPeerDescriptor: PeerDescriptor, targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        setImmediate(() => {
            const remoteConnector = new RemoteWebSocketConnector(
                targetPeerDescriptor,
                toProtoRpcClient(new WebSocketConnectorServiceClient(this.rpcCommunicator.getRpcClientTransport()))
            )
            remoteConnector.requestConnection(ownPeerDescriptor, ownPeerDescriptor.websocket!.host, ownPeerDescriptor.websocket!.port)
        })
        const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion, ConnectionType.WEBSOCKET_SERVER)
        managedConnection.on('disconnected', () => this.ongoingConnectRequests.delete(keyFromPeerDescriptor(targetPeerDescriptor)))
        managedConnection.setPeerDescriptor(targetPeerDescriptor)
        this.ongoingConnectRequests.set(keyFromPeerDescriptor(targetPeerDescriptor), managedConnection)
        return managedConnection
    }

    private onServerSocketHandshakeRequest = (peerDescriptor: PeerDescriptor, serverWebSocket: IConnection) => {

        const peerId = peerIdFromPeerDescriptor(peerDescriptor)

        if (this.ongoingConnectRequests.has(peerId.toKey())) {
            const ongoingConnectReguest = this.ongoingConnectRequests.get(peerId.toKey())!
            ongoingConnectReguest.attachImplementation(serverWebSocket, peerDescriptor)
            ongoingConnectReguest.acceptHandshake()
            this.ongoingConnectRequests.delete(peerId.toKey())
        } else {
            const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion,
                ConnectionType.WEBSOCKET_SERVER, undefined, serverWebSocket)

            managedConnection.setPeerDescriptor(peerDescriptor)

            if (this.incomingConnectionCallback(managedConnection)) {
                managedConnection.acceptHandshake()
            } else {
                managedConnection.rejectHandshake('Duplicate connection')
                managedConnection.destroy()
            }
        }
    }

    public setOwnPeerDescriptor(ownPeerDescriptor: PeerDescriptor): void {
        this.ownPeerDescriptor = ownPeerDescriptor
    }

    public async destroy(): Promise<void> {
        this.destroyed = true
        this.rpcCommunicator.stop()
        this.autocertifierRpcCommunicator.stop()
        this.autocertifierClient?.stop()
        const requests = Array.from(this.ongoingConnectRequests.values())
        await Promise.allSettled(requests.map((conn) => conn.close('OTHER')))

        const attempts = Array.from(this.connectingConnections.values())
        await Promise.allSettled(attempts.map((conn) => conn.close('OTHER')))
        this.connectivityChecker?.destroy()
        await this.webSocketServer?.stop()
    }

    // IWebSocketConnectorService implementation
    public async requestConnection(request: WebSocketConnectionRequest, _context: ServerCallContext): Promise<WebSocketConnectionResponse> {
        if (!this.destroyed && this.canConnectFunction(request.requester!, request.ip, request.port)) {
            setImmediate(() => {
                if (this.destroyed) {
                    return
                }
                const connection = this.connect(request.requester!)
                this.incomingConnectionCallback(connection)
            })
            const res: WebSocketConnectionResponse = {
                accepted: true
            }
            return res
        }
        return {
            accepted: false
        }
    }
}
