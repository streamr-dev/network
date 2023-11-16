import { Logger } from '@streamr/utils'
import {
    ConnectivityResponse,
    PeerDescriptor
} from '../proto/packages/dht/protos/DhtRpc'
import { ITransport } from '../transport/ITransport'
import { PortRange, TlsCertificate } from './ConnectionManager'
import { ManagedConnection } from './ManagedConnection'
import { Simulator } from './simulator/Simulator'
import { SimulatorConnector } from './simulator/SimulatorConnector'
import { IceServer, WebrtcConnector } from './webrtc/WebrtcConnector'
import { WebsocketConnector } from './websocket/WebsocketConnector'

export interface ConnectorFacade {
    createConnection: (peerDescriptor: PeerDescriptor) => ManagedConnection
    getLocalPeerDescriptor: () => PeerDescriptor | undefined
    start: (
        onNewConnection: (connection: ManagedConnection) => boolean,
        canConnect: (peerDescriptor: PeerDescriptor) => boolean,
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
    webrtcNewConnectionTimeout?: number
    externalIp?: string
    webrtcPortRange?: PortRange
    maxMessageSize?: number
    tlsCertificate?: TlsCertificate
    websocketServerEnableTls?: boolean
    autoCertifierUrl?: string
    autoCertifierConfigFile?: string
    createLocalPeerDescriptor: (connectivityResponse: ConnectivityResponse) => PeerDescriptor
}

export class DefaultConnectorFacade implements ConnectorFacade {

    private readonly config: DefaultConnectorFacadeConfig
    private localPeerDescriptor?: PeerDescriptor
    private websocketConnector?: WebsocketConnector
    private webrtcConnector?: WebrtcConnector

    constructor(config: DefaultConnectorFacadeConfig) {
        this.config = config
    }

    async start(
        onNewConnection: (connection: ManagedConnection) => boolean,
        canConnect: (peerDescriptor: PeerDescriptor) => boolean,
        autoCertifierTransport: ITransport
    ): Promise<void> {
        logger.trace(`Creating WebsocketConnectorRpcLocal`)
        const webSocketConnectorConfig = {
            transport: this.config.transport!,
            // TODO should we use canConnect also for WebrtcConnector? (NET-1142)
            canConnect: (peerDescriptor: PeerDescriptor) => canConnect(peerDescriptor),
            onNewConnection,
            portRange: this.config.websocketPortRange,
            host: this.config.websocketHost,
            entrypoints: this.config.entryPoints,
            tlsCertificate: this.config.tlsCertificate,
            serverEnableTls: this.config.websocketServerEnableTls!,
            autoCertifierUrl: this.config.autoCertifierUrl!,
            autoCertifierConfigFile: this.config.autoCertifierConfigFile!,
            autoCertifierTransport,
            maxMessageSize: this.config.maxMessageSize
        }
        this.websocketConnector = new WebsocketConnector(webSocketConnectorConfig)
        logger.trace(`Creating WebRtcConnectorRpcLocal`)
        this.webrtcConnector = new WebrtcConnector({
            transport: this.config.transport!,
            iceServers: this.config.iceServers,
            allowPrivateAddresses: this.config.webrtcAllowPrivateAddresses,
            bufferThresholdLow: this.config.webrtcDatachannelBufferThresholdLow,
            bufferThresholdHigh: this.config.webrtcDatachannelBufferThresholdHigh,
            connectionTimeout: this.config.webrtcNewConnectionTimeout,
            externalIp: this.config.externalIp,
            portRange: this.config.webrtcPortRange,
            maxMessageSize: this.config.maxMessageSize
        }, onNewConnection)
        await this.websocketConnector.start()
        // TODO: generate a PeerDescriptor in a single function. Requires changes to the createOwnPeerDescriptor
        // function in the config. Currently it's given by the DhtNode and it sets the PeerDescriptor for the
        // DhtNode in each call. 
        // LocalPeerDescriptor could be stored in one place and passed from there to the connectors
        const temporarilySelfSigned = (!this.config.tlsCertificate && this.config.websocketServerEnableTls === true)
        const connectivityResponse = await this.websocketConnector.checkConnectivity(temporarilySelfSigned)
        let localPeerDescriptor = this.config.createLocalPeerDescriptor(connectivityResponse)
        this.localPeerDescriptor = localPeerDescriptor
        this.websocketConnector.setLocalPeerDescriptor(localPeerDescriptor)
        if (localPeerDescriptor.websocket && !this.config.tlsCertificate && this.config.websocketServerEnableTls) {
            try {
                await this.websocketConnector!.autoCertify()
                const connectivityResponse = await this.websocketConnector!.checkConnectivity(false)
                localPeerDescriptor = this.config.createLocalPeerDescriptor(connectivityResponse)
                this.localPeerDescriptor = localPeerDescriptor
                if (localPeerDescriptor.websocket === undefined) {
                    logger.warn('ConnectivityCheck failed after autocertification, websocket server connectivity disabled')
                }
                this.websocketConnector!.setLocalPeerDescriptor(localPeerDescriptor)
            } catch (err) {
                logger.warn('Failed to autocertify, disabling websocket server TLS')
                await this.websocketConnector.destroy()
                this.websocketConnector = new WebsocketConnector({
                    ...webSocketConnectorConfig,
                    serverEnableTls: false,
                })
                await this.websocketConnector.start()
                const connectivityResponse = await this.websocketConnector.checkConnectivity(false)
                localPeerDescriptor = this.config.createLocalPeerDescriptor(connectivityResponse)
                this.localPeerDescriptor = localPeerDescriptor
                this.websocketConnector.setLocalPeerDescriptor(localPeerDescriptor)
            }
        }
        this.webrtcConnector.setLocalPeerDescriptor(localPeerDescriptor)
    }

    createConnection(peerDescriptor: PeerDescriptor): ManagedConnection {
        if (this.websocketConnector!.isPossibleToFormConnection(peerDescriptor)) {
            return this.websocketConnector!.connect(peerDescriptor)
        } else {
            return this.webrtcConnector!.connect(peerDescriptor)
        }
    }

    getLocalPeerDescriptor(): PeerDescriptor | undefined {
        return this.localPeerDescriptor
    }

    async stop(): Promise<void> {
        await this.websocketConnector!.destroy()
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

    async start(onNewConnection: (connection: ManagedConnection) => boolean): Promise<void> {
        logger.trace(`Creating SimulatorConnector`)
        this.simulatorConnector = new SimulatorConnector(
            this.localPeerDescriptor,
            this.simulator,
            onNewConnection
        )
        this.simulator.addConnector(this.simulatorConnector)
    }

    createConnection(peerDescriptor: PeerDescriptor): ManagedConnection {
        return this.simulatorConnector!.connect(peerDescriptor)
    }

    getLocalPeerDescriptor(): PeerDescriptor {
        return this.localPeerDescriptor
    }

    async stop(): Promise<void> {
        await this.simulatorConnector!.stop()
    }
}
