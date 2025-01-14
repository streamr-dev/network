import { Logger } from '@streamr/utils'
import { ConnectivityResponse, PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { ITransport } from '../transport/ITransport'
import { PortRange, TlsCertificate } from './ConnectionManager'
import { Simulator } from './simulator/Simulator'
import { SimulatorConnector } from './simulator/SimulatorConnector'
import { IceServer, WebrtcConnector } from './webrtc/WebrtcConnector'
import { WebsocketClientConnector } from './websocket/WebsocketClientConnector'
import { DhtAddress } from '../identifiers'
import { WebsocketServerConnector, WebsocketServerConnectorOptions } from './websocket/WebsocketServerConnector'
import { PendingConnection } from './PendingConnection'
import { ListeningRpcCommunicator } from '../transport/ListeningRpcCommunicator'

export interface ConnectorFacade {
    createConnection: (peerDescriptor: PeerDescriptor) => PendingConnection
    getLocalPeerDescriptor: () => PeerDescriptor | undefined
    start: (
        onNewConnection: (connection: PendingConnection) => boolean,
        hasConnection: (nodeId: DhtAddress) => boolean,
        autoCertifierTransport: ITransport
    ) => Promise<void>
    stop: () => Promise<void>
}

const logger = new Logger(module)

// TODO: Wrap component specific configs to their own objects.
export interface DefaultConnectorFacadeOptions {
    transport: ITransport
    websocketHost?: string
    websocketPortRange?: PortRange
    entryPoints?: PeerDescriptor[]
    iceServers?: IceServer[]
    webrtcAllowPrivateAddresses?: boolean
    webrtcDatachannelBufferThresholdLow?: number
    webrtcDatachannelBufferThresholdHigh?: number
    externalIp?: string
    webrtcPortRange?: PortRange
    maxMessageSize?: number
    tlsCertificate?: TlsCertificate
    // TODO explicit default value for "websocketServerEnableTls" or make it required
    websocketServerEnableTls?: boolean
    autoCertifierUrl?: string
    autoCertifierConfigFile?: string
    geoIpDatabaseFolder?: string
    createLocalPeerDescriptor: (connectivityResponse: ConnectivityResponse) => Promise<PeerDescriptor>
}

export class DefaultConnectorFacade implements ConnectorFacade {
    private readonly options: DefaultConnectorFacadeOptions
    private localPeerDescriptor?: PeerDescriptor
    private websocketConnectorRpcCommunicator?: ListeningRpcCommunicator
    private websocketClientConnector?: WebsocketClientConnector
    private websocketServerConnector?: WebsocketServerConnector
    private webrtcConnector?: WebrtcConnector
    constructor(options: DefaultConnectorFacadeOptions) {
        this.options = options
    }

    async start(
        onNewConnection: (connection: PendingConnection) => boolean,
        hasConnection: (nodeId: DhtAddress) => boolean,
        autoCertifierTransport: ITransport
    ): Promise<void> {
        logger.trace(`Creating WebsocketConnectorRpcLocal`)
        this.websocketConnectorRpcCommunicator = new ListeningRpcCommunicator(
            WebsocketClientConnector.WEBSOCKET_CONNECTOR_SERVICE_ID,
            this.options.transport,
            { rpcRequestTimeout: 15000 } // TODO use options option or named constant?
        )
        const webSocketClientConnectorOptions = {
            // TODO should we use canConnect also for WebrtcConnector? (NET-1142)
            onNewConnection,
            hasConnection,
            rpcCommunicator: this.websocketConnectorRpcCommunicator
        }
        this.websocketClientConnector = new WebsocketClientConnector(webSocketClientConnectorOptions)

        const webSocketServerConnectorOptions = {
            rpcCommunicator: this.websocketConnectorRpcCommunicator,
            // TODO should we use canConnect also for WebrtcConnector? (NET-1142)
            onNewConnection,
            hasConnection,
            portRange: this.options.websocketPortRange,
            host: this.options.websocketHost,
            entrypoints: this.options.entryPoints,
            tlsCertificate: this.options.tlsCertificate,
            serverEnableTls: this.options.websocketServerEnableTls!,
            autoCertifierUrl: this.options.autoCertifierUrl!,
            autoCertifierConfigFile: this.options.autoCertifierConfigFile!,
            autoCertifierTransport,
            maxMessageSize: this.options.maxMessageSize,
            geoIpDatabaseFolder: this.options.geoIpDatabaseFolder
        }
        this.websocketServerConnector = new WebsocketServerConnector(webSocketServerConnectorOptions)
        this.webrtcConnector = new WebrtcConnector({
            onNewConnection,
            transport: this.options.transport,
            iceServers: this.options.iceServers,
            allowPrivateAddresses: this.options.webrtcAllowPrivateAddresses,
            bufferThresholdLow: this.options.webrtcDatachannelBufferThresholdLow,
            bufferThresholdHigh: this.options.webrtcDatachannelBufferThresholdHigh,
            externalIp: this.options.externalIp,
            portRange: this.options.webrtcPortRange,
            maxMessageSize: this.options.maxMessageSize
        })
        await this.websocketServerConnector.start()
        // TODO: generate a PeerDescriptor in a single function. Requires changes to the createOwnPeerDescriptor
        // function in the options. Currently it's given by the DhtNode and it sets the PeerDescriptor for the
        // DhtNode in each call.
        // LocalPeerDescriptor could be stored in one place and passed from there to the connectors
        const temporarilySelfSigned = !this.options.tlsCertificate && this.options.websocketServerEnableTls === true
        const connectivityResponse = await this.websocketServerConnector.checkConnectivity(temporarilySelfSigned)
        const localPeerDescriptor = await this.options.createLocalPeerDescriptor(connectivityResponse)
        this.setLocalPeerDescriptor(localPeerDescriptor)
        if (localPeerDescriptor.websocket && !this.options.tlsCertificate && this.options.websocketServerEnableTls) {
            try {
                await this.websocketServerConnector.autoCertify()
                const connectivityResponse = await this.websocketServerConnector.checkConnectivity(false)
                const autocertifiedLocalPeerDescriptor =
                    await this.options.createLocalPeerDescriptor(connectivityResponse)
                if (autocertifiedLocalPeerDescriptor.websocket !== undefined) {
                    this.setLocalPeerDescriptor(autocertifiedLocalPeerDescriptor)
                } else {
                    logger.warn('Connectivity check failed after auto-certification, disabling WebSocket server TLS')
                    await this.restartWebsocketServerConnector({
                        ...webSocketServerConnectorOptions,
                        serverEnableTls: false
                    })
                }
            } catch (err) {
                logger.warn('Failed to auto-certify, disabling WebSocket server TLS', { err })
                await this.restartWebsocketServerConnector({
                    ...webSocketServerConnectorOptions,
                    serverEnableTls: false
                })
            }
        }
    }

    private setLocalPeerDescriptor(peerDescriptor: PeerDescriptor) {
        this.localPeerDescriptor = peerDescriptor
        this.websocketServerConnector!.setLocalPeerDescriptor(peerDescriptor)
        this.websocketClientConnector!.setLocalPeerDescriptor(peerDescriptor)
        this.webrtcConnector!.setLocalPeerDescriptor(peerDescriptor)
    }

    async restartWebsocketServerConnector(options: WebsocketServerConnectorOptions): Promise<void> {
        await this.websocketServerConnector!.destroy()
        this.websocketServerConnector = new WebsocketServerConnector(options)
        await this.websocketServerConnector.start()
        const connectivityResponse = await this.websocketServerConnector.checkConnectivity(false)
        const localPeerDescriptor = await this.options.createLocalPeerDescriptor(connectivityResponse)
        this.setLocalPeerDescriptor(localPeerDescriptor)
    }

    createConnection(peerDescriptor: PeerDescriptor): PendingConnection {
        if (this.websocketClientConnector!.isPossibleToFormConnection(peerDescriptor)) {
            return this.websocketClientConnector!.connect(peerDescriptor)
        } else if (this.websocketServerConnector!.isPossibleToFormConnection(peerDescriptor)) {
            return this.websocketServerConnector!.connect(peerDescriptor)
        } else {
            return this.webrtcConnector!.connect(peerDescriptor, false)
        }
    }

    getLocalPeerDescriptor(): PeerDescriptor | undefined {
        return this.localPeerDescriptor
    }

    async stop(): Promise<void> {
        this.websocketConnectorRpcCommunicator!.destroy()
        await this.websocketServerConnector!.destroy()
        await this.websocketClientConnector!.destroy()
        await this.webrtcConnector!.stop()
    }
}

export class SimulatorConnectorFacade implements ConnectorFacade {
    private readonly localPeerDescriptor: PeerDescriptor
    private simulatorConnector?: SimulatorConnector
    private simulator: Simulator

    constructor(localPeerDescriptor: PeerDescriptor, simulator: Simulator) {
        this.localPeerDescriptor = localPeerDescriptor
        this.simulator = simulator
    }

    async start(onNewConnection: (connection: PendingConnection) => boolean): Promise<void> {
        logger.trace(`Creating SimulatorConnector`)
        this.simulatorConnector = new SimulatorConnector(this.localPeerDescriptor, this.simulator, onNewConnection)
        this.simulator.addConnector(this.simulatorConnector)
    }

    createConnection(peerDescriptor: PeerDescriptor): PendingConnection {
        return this.simulatorConnector!.connect(peerDescriptor)
    }

    getLocalPeerDescriptor(): PeerDescriptor {
        return this.localPeerDescriptor
    }

    async stop(): Promise<void> {
        await this.simulatorConnector!.stop()
    }
}
