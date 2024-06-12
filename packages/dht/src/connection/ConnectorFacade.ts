import { Logger } from '@streamr/utils'
import {
    ConnectivityResponse,
    PeerDescriptor
} from '../proto/packages/dht/protos/DhtRpc'
import { ITransport } from '../transport/ITransport'
import { PortRange, TlsCertificate } from './ConnectionManager'
import { Simulator } from './simulator/Simulator'
import { SimulatorConnector } from './simulator/SimulatorConnector'
import { IceServer, WebrtcConnector } from './webrtc/WebrtcConnector'
import { WebsocketClientConnector } from './websocket/WebsocketClientConnector'
import { DhtAddress } from '../identifiers'
import { WebsocketServerConnector, WebsocketServerConnectorConfig } from './websocket/WebsocketServerConnector'
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
export interface DefaultConnectorFacadeConfig {
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

    private readonly config: DefaultConnectorFacadeConfig
    private localPeerDescriptor?: PeerDescriptor
    private websocketConnectorRpcCommunicator?: ListeningRpcCommunicator
    private websocketClientConnector?: WebsocketClientConnector
    private websocketServerConnector?: WebsocketServerConnector
    private webrtcConnector?: WebrtcConnector
    constructor(config: DefaultConnectorFacadeConfig) {
        this.config = config
    }

    async start(
        onNewConnection: (connection: PendingConnection) => boolean,
        hasConnection: (nodeId: DhtAddress) => boolean,
        autoCertifierTransport: ITransport
    ): Promise<void> {
        logger.trace(`Creating WebsocketConnectorRpcLocal`)
        this.websocketConnectorRpcCommunicator = new ListeningRpcCommunicator(
            WebsocketClientConnector.WEBSOCKET_CONNECTOR_SERVICE_ID, 
            this.config.transport, 
            { rpcRequestTimeout: 15000 }  // TODO use config option or named constant?
        
        )
        const webSocketClientConnectorConfig = {
            // TODO should we use canConnect also for WebrtcConnector? (NET-1142)
            onNewConnection,
            hasConnection,
            rpcCommunicator: this.websocketConnectorRpcCommunicator
        }
        this.websocketClientConnector = new WebsocketClientConnector(webSocketClientConnectorConfig)

        const webSocketServerConnectorConfig = {
            rpcCommunicator: this.websocketConnectorRpcCommunicator,
            // TODO should we use canConnect also for WebrtcConnector? (NET-1142)
            onNewConnection,
            hasConnection,
            portRange: this.config.websocketPortRange,
            host: this.config.websocketHost,
            entrypoints: this.config.entryPoints,
            tlsCertificate: this.config.tlsCertificate,
            serverEnableTls: this.config.websocketServerEnableTls!,
            autoCertifierUrl: this.config.autoCertifierUrl!,
            autoCertifierConfigFile: this.config.autoCertifierConfigFile!,
            autoCertifierTransport,
            maxMessageSize: this.config.maxMessageSize,
            geoIpDatabaseFolder: this.config.geoIpDatabaseFolder
        }
        this.websocketServerConnector = new WebsocketServerConnector(webSocketServerConnectorConfig)
        this.webrtcConnector = new WebrtcConnector({
            onNewConnection,
            transport: this.config.transport,
            iceServers: this.config.iceServers,
            allowPrivateAddresses: this.config.webrtcAllowPrivateAddresses,
            bufferThresholdLow: this.config.webrtcDatachannelBufferThresholdLow,
            bufferThresholdHigh: this.config.webrtcDatachannelBufferThresholdHigh,
            externalIp: this.config.externalIp,
            portRange: this.config.webrtcPortRange,
            maxMessageSize: this.config.maxMessageSize
        })
        await this.websocketServerConnector.start()
        // TODO: generate a PeerDescriptor in a single function. Requires changes to the createOwnPeerDescriptor
        // function in the config. Currently it's given by the DhtNode and it sets the PeerDescriptor for the
        // DhtNode in each call. 
        // LocalPeerDescriptor could be stored in one place and passed from there to the connectors
        const temporarilySelfSigned = (!this.config.tlsCertificate && this.config.websocketServerEnableTls === true)
        const connectivityResponse = await this.websocketServerConnector.checkConnectivity(temporarilySelfSigned)
        const localPeerDescriptor = await this.config.createLocalPeerDescriptor(connectivityResponse)
        this.setLocalPeerDescriptor(localPeerDescriptor)
        if (localPeerDescriptor.websocket && !this.config.tlsCertificate && this.config.websocketServerEnableTls) {
            try {
                await this.websocketServerConnector.autoCertify()
                const connectivityResponse = await this.websocketServerConnector.checkConnectivity(false)
                const autocertifiedLocalPeerDescriptor = await this.config.createLocalPeerDescriptor(connectivityResponse)
                if (autocertifiedLocalPeerDescriptor.websocket !== undefined) {
                    this.setLocalPeerDescriptor(autocertifiedLocalPeerDescriptor)
                } else {
                    logger.warn('Connectivity check failed after auto-certification, disabling WebSocket server TLS')
                    await this.restartWebsocketServerConnector({
                        ...webSocketServerConnectorConfig,
                        serverEnableTls: false
                    })
                }
            } catch (err) {
                logger.warn('Failed to auto-certify, disabling WebSocket server TLS', { err })
                await this.restartWebsocketServerConnector({
                    ...webSocketServerConnectorConfig,
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
    
    async restartWebsocketServerConnector(config: WebsocketServerConnectorConfig): Promise<void> {
        await this.websocketServerConnector!.destroy()
        this.websocketServerConnector = new WebsocketServerConnector(config)
        await this.websocketServerConnector.start()
        const connectivityResponse = await this.websocketServerConnector.checkConnectivity(false)
        const localPeerDescriptor = await this.config.createLocalPeerDescriptor(connectivityResponse)
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

    async start(
        onNewConnection: (connection: PendingConnection) => boolean,
    ): Promise<void> {
        logger.trace(`Creating SimulatorConnector`)
        this.simulatorConnector = new SimulatorConnector(
            this.localPeerDescriptor,
            this.simulator,
            onNewConnection
        )
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
