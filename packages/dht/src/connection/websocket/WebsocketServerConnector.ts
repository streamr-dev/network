import { GeoIpLocator } from '@streamr/geoip-location'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { Action, connectivityMethodToWebsocketUrl } from './WebsocketClientConnector'
import { WebsocketServer } from './WebsocketServer'
import { areEqualPeerDescriptors, DhtAddress, toNodeId } from '../../identifiers'
import { AutoCertifierClientFacade } from './AutoCertifierClientFacade'
import { ConnectivityResponse, HandshakeError, PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'
import { NatType, PortRange, TlsCertificate } from '../ConnectionManager'
import { ITransport } from '../../transport/ITransport'
import { ipv4ToNumber, Logger, wait } from '@streamr/utils'
import { attachConnectivityRequestHandler, DISABLE_CONNECTIVITY_PROBE } from '../connectivityRequestHandler'
import { WebsocketServerConnection } from './WebsocketServerConnection'
import { ConnectionType, IConnection } from '../IConnection'
import queryString from 'querystring'
import { isMaybeSupportedProtocolVersion, LOCAL_PROTOCOL_VERSION } from '../../helpers/version'
import { shuffle } from 'lodash'
import { sendConnectivityRequest } from '../connectivityChecker'
import { acceptHandshake, Handshaker, rejectHandshake } from '../Handshaker'
import { WebsocketClientConnectorRpcRemote } from './WebsocketClientConnectorRpcRemote'
import { WebsocketClientConnectorRpcClient } from '../../../generated/packages/dht/protos/DhtRpc.client'
import { WebsocketServerStartError } from '../../helpers/errors'
import * as Err from '../../helpers/errors'
import { expectedConnectionType } from '../../helpers/Connectivity'
import { PendingConnection } from '../PendingConnection'

const logger = new Logger(module)

export interface WebsocketServerConnectorOptions {
    onNewConnection: (connection: PendingConnection) => boolean
    rpcCommunicator: ListeningRpcCommunicator
    hasConnection: (nodeId: DhtAddress) => boolean
    portRange?: PortRange
    maxMessageSize?: number
    host?: string
    entrypoints?: PeerDescriptor[]
    tlsCertificate?: TlsCertificate
    autoCertifierTransport: ITransport
    autoCertifierUrl: string
    autoCertifierConfigFile: string
    serverEnableTls: boolean
    geoIpDatabaseFolder?: string
}

// TODO: Could delFunc be removed here if the Handshaker event based clean up works correctly now?
interface OngoingConnectionRequest {
    delFunc: () => void
    pendingConnection: PendingConnection
}

// TODO: Move server starting logic including autocertification and connectivity checking to WebsocketServer.ts?
export class WebsocketServerConnector {
    private readonly websocketServer?: WebsocketServer
    private geoIpLocator?: GeoIpLocator
    private readonly ongoingConnectRequests: Map<DhtAddress, OngoingConnectionRequest> = new Map()
    private host?: string
    private autoCertifierClient?: AutoCertifierClientFacade
    private selectedPort?: number
    private localPeerDescriptor?: PeerDescriptor
    private abortController = new AbortController()
    private readonly options: WebsocketServerConnectorOptions

    constructor(options: WebsocketServerConnectorOptions) {
        this.options = options
        this.websocketServer = options.portRange
            ? new WebsocketServer({
                  portRange: options.portRange,
                  tlsCertificate: options.tlsCertificate,
                  maxMessageSize: options.maxMessageSize,
                  enableTls: options.serverEnableTls
              })
            : undefined
        this.host = options.host
    }

    public async start(): Promise<void> {
        if (!this.abortController.signal.aborted && this.websocketServer) {
            this.websocketServer.on('connected', (connection: IConnection) => {
                const serverSocket = connection as unknown as WebsocketServerConnection
                const query = queryString.parse((serverSocket.resourceURL.query as string) ?? '')
                const action = query.action as Action | undefined
                logger.trace('WebSocket client connected', { action, remoteAddress: serverSocket.getRemoteIpAddress() })
                if (action === 'connectivityRequest') {
                    attachConnectivityRequestHandler(serverSocket, this.geoIpLocator)
                } else if (action === 'connectivityProbe') {
                    // no-op
                } else {
                    // The localPeerDescriptor can be undefined here as the WS server is used for connectivity checks
                    // before the localPeerDescriptor is set during start.
                    // Handshaked connections should be rejected before the localPeerDescriptor is set.
                    // eslint-disable-next-line no-lonely-if
                    if (this.localPeerDescriptor !== undefined) {
                        this.attachHandshaker(connection)
                    } else {
                        logger.trace(
                            'incoming Websocket connection before localPeerDescriptor was set, closing connection'
                        )
                        connection.close(false).catch(() => {})
                    }
                }
            })

            if (this.options.geoIpDatabaseFolder) {
                const geoIpLocator = new GeoIpLocator(this.options.geoIpDatabaseFolder)
                try {
                    await geoIpLocator.start()
                    this.geoIpLocator = geoIpLocator
                } catch (err) {
                    logger.error('Failed to start GeoIpLocator', { err })
                }
            }

            const port = await this.websocketServer.start()
            this.selectedPort = port
        }
    }

    private attachHandshaker(connection: IConnection) {
        // TODO: use createIncomingHandshaker here?
        const handshaker = new Handshaker(this.localPeerDescriptor!, connection)
        handshaker.once(
            'handshakeRequest',
            (
                localPeerDescriptor: PeerDescriptor,
                remoteProtocolVersion: string,
                remotePeerDescriptor?: PeerDescriptor
            ) => {
                this.onServerSocketHandshakeRequest(
                    localPeerDescriptor,
                    connection,
                    handshaker,
                    remoteProtocolVersion,
                    remotePeerDescriptor
                )
            }
        )
    }

    private onServerSocketHandshakeRequest(
        remotePeerDescriptor: PeerDescriptor,
        websocketServerConnection: IConnection,
        handshaker: Handshaker,
        remoteProtocolVersion: string,
        targetPeerDescriptor?: PeerDescriptor
    ) {
        const nodeId = toNodeId(remotePeerDescriptor)
        if (this.ongoingConnectRequests.has(nodeId)) {
            const { pendingConnection, delFunc } = this.ongoingConnectRequests.get(nodeId)!
            if (!isMaybeSupportedProtocolVersion(remoteProtocolVersion)) {
                rejectHandshake(
                    pendingConnection,
                    websocketServerConnection,
                    handshaker,
                    HandshakeError.UNSUPPORTED_PROTOCOL_VERSION
                )
                delFunc()
            } else if (
                targetPeerDescriptor &&
                !areEqualPeerDescriptors(this.localPeerDescriptor!, targetPeerDescriptor)
            ) {
                rejectHandshake(
                    pendingConnection,
                    websocketServerConnection,
                    handshaker,
                    HandshakeError.INVALID_TARGET_PEER_DESCRIPTOR
                )
                delFunc()
            } else {
                acceptHandshake(handshaker, pendingConnection, websocketServerConnection)
            }
        } else {
            const pendingConnection = new PendingConnection(remotePeerDescriptor)

            if (!isMaybeSupportedProtocolVersion(remoteProtocolVersion)) {
                rejectHandshake(
                    pendingConnection,
                    websocketServerConnection,
                    handshaker,
                    HandshakeError.UNSUPPORTED_PROTOCOL_VERSION
                )
            } else if (
                targetPeerDescriptor &&
                !areEqualPeerDescriptors(this.localPeerDescriptor!, targetPeerDescriptor)
            ) {
                rejectHandshake(
                    pendingConnection,
                    websocketServerConnection,
                    handshaker,
                    HandshakeError.INVALID_TARGET_PEER_DESCRIPTOR
                )
            } else if (this.options.onNewConnection(pendingConnection)) {
                acceptHandshake(handshaker, pendingConnection, websocketServerConnection)
            } else {
                rejectHandshake(
                    pendingConnection,
                    websocketServerConnection,
                    handshaker,
                    HandshakeError.DUPLICATE_CONNECTION
                )
            }
        }
    }

    public async checkConnectivity(allowSelfSignedCertificate: boolean): Promise<ConnectivityResponse> {
        // TODO: this could throw?
        if (this.abortController.signal.aborted) {
            return {
                host: '127.0.0.1',
                natType: NatType.UNKNOWN,
                ipAddress: ipv4ToNumber('127.0.0.1'),
                protocolVersion: LOCAL_PROTOCOL_VERSION
            }
        }
        if (!this.options.entrypoints || this.options.entrypoints.length === 0) {
            // return connectivity info given in options
            return {
                host: this.host!,
                natType: NatType.OPEN_INTERNET,
                websocket: {
                    host: this.host!,
                    port: this.selectedPort!,
                    tls: this.options.tlsCertificate !== undefined
                },
                // TODO: Resolve the given host name or or use as is if IP was given.
                ipAddress: ipv4ToNumber('127.0.0.1'),
                protocolVersion: LOCAL_PROTOCOL_VERSION
            }
        }
        const shuffledEntrypoints = shuffle(this.options.entrypoints)
        while (shuffledEntrypoints.length > 0 && !this.abortController.signal.aborted) {
            const entryPoint = shuffledEntrypoints[0]
            try {
                // Do real connectivity checking
                const connectivityRequest = {
                    port: this.selectedPort ?? DISABLE_CONNECTIVITY_PROBE,
                    host: this.host,
                    tls: this.websocketServer ? this.options.serverEnableTls : false,
                    allowSelfSignedCertificate
                }
                if (!this.abortController.signal.aborted) {
                    return await sendConnectivityRequest(connectivityRequest, entryPoint)
                } else {
                    throw new Err.ConnectionFailed('ConnectivityChecker is destroyed')
                }
            } catch (err) {
                const error =
                    `Failed to connect to entrypoint with id ${toNodeId(entryPoint)} ` +
                    `and URL ${connectivityMethodToWebsocketUrl(entryPoint.websocket!)}`
                logger.error(error, { err })
                shuffledEntrypoints.shift()
                await wait(2000, this.abortController.signal)
            }
        }
        throw new WebsocketServerStartError(
            `Failed to connect to the entrypoints after ${this.options.entrypoints.length} attempts\n` +
                `Attempted hosts: ${this.options.entrypoints.map((entry) => `${entry.websocket!.host}:${entry.websocket!.port}`).join(', ')}`
        )
    }

    public async autoCertify(): Promise<void> {
        this.autoCertifierClient = new AutoCertifierClientFacade({
            configFile: this.options.autoCertifierConfigFile,
            transport: this.options.autoCertifierTransport,
            url: this.options.autoCertifierUrl,
            wsServerPort: this.selectedPort!,
            setHost: (hostName: string) => this.setHost(hostName),
            updateCertificate: (certificate: string, privateKey: string) =>
                this.websocketServer!.updateCertificate(certificate, privateKey)
        })
        logger.trace(`AutoCertifying subdomain...`)
        await this.autoCertifierClient.start()
    }

    private setHost(hostName: string): void {
        logger.trace(`Setting host name to ${hostName}`)
        this.host = hostName
    }

    public connect(targetPeerDescriptor: PeerDescriptor): PendingConnection {
        const nodeId = toNodeId(targetPeerDescriptor)
        if (this.ongoingConnectRequests.has(nodeId)) {
            return this.ongoingConnectRequests.get(nodeId)!.pendingConnection
        }
        return this.requestConnectionFromPeer(this.localPeerDescriptor!, targetPeerDescriptor)
    }

    private requestConnectionFromPeer(
        localPeerDescriptor: PeerDescriptor,
        targetPeerDescriptor: PeerDescriptor
    ): PendingConnection {
        setImmediate(() => {
            const remoteConnector = new WebsocketClientConnectorRpcRemote(
                localPeerDescriptor,
                targetPeerDescriptor,
                this.options.rpcCommunicator,
                WebsocketClientConnectorRpcClient
            )
            remoteConnector.requestConnection().then(
                () => {
                    logger.trace('Sent WebsocketConnectionRequest notification to peer', { targetPeerDescriptor })
                },
                (err) => {
                    logger.debug('Failed to send WebsocketConnectionRequest notification to peer ', {
                        error: err,
                        targetPeerDescriptor
                    })
                }
            )
        })
        const pendingConnection = new PendingConnection(targetPeerDescriptor)
        const nodeId = toNodeId(targetPeerDescriptor)
        // TODO: can this leak?
        const delFunc = () => {
            pendingConnection.off('connected', delFunc)
            pendingConnection.off('disconnected', delFunc)
            this.ongoingConnectRequests.delete(nodeId)
        }
        pendingConnection.on('connected', delFunc)
        pendingConnection.on('disconnected', delFunc)
        this.ongoingConnectRequests.set(nodeId, { pendingConnection, delFunc })
        return pendingConnection
    }

    public isPossibleToFormConnection(targetPeerDescriptor: PeerDescriptor): boolean {
        const connectionType = expectedConnectionType(this.localPeerDescriptor!, targetPeerDescriptor)
        return connectionType === ConnectionType.WEBSOCKET_SERVER
    }

    public setLocalPeerDescriptor(localPeerDescriptor: PeerDescriptor): void {
        this.localPeerDescriptor = localPeerDescriptor
    }

    public async destroy(): Promise<void> {
        this.abortController.abort()

        const requests = Array.from(this.ongoingConnectRequests.values())
        await Promise.allSettled(
            requests.map((ongoingConnectRequest) => ongoingConnectRequest.pendingConnection.close(true))
        )

        await this.websocketServer?.stop()
        this.geoIpLocator?.stop()
    }
}
