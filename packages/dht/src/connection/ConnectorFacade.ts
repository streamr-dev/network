import { Logger } from '@streamr/utils'
import { isPrivateIPv4 } from '../helpers/AddressTools'
import {
    ConnectivityResponse,
    NodeType,
    PeerDescriptor
} from '../proto/packages/dht/protos/DhtRpc'
import { ITransport } from '../transport/ITransport'
import { ConnectionManager, PortRange, TlsCertificate } from './ConnectionManager'
import { ManagedConnection } from './ManagedConnection'
import { Simulator } from './Simulator/Simulator'
import { SimulatorConnector } from './Simulator/SimulatorConnector'
import { WEB_RTC_CLEANUP } from './WebRTC/NodeWebRtcConnection'
import { IceServer, WebRtcConnector } from './WebRTC/WebRtcConnector'
import { WebSocketConnector } from './WebSocket/WebSocketConnector'

export interface ConnectorFacade {
    createConnection: (peerDescriptor: PeerDescriptor) => ManagedConnection
    getOwnPeerDescriptor: () => PeerDescriptor | undefined
    start: (
        onIncomingConnection: (connection: ManagedConnection) => boolean,
        canConnect: (peerDescriptor: PeerDescriptor) => boolean
    ) => Promise<void>
    stop: () => Promise<void>
}

const logger = new Logger(module)

export interface DefaultConnectorFacadeConfig {
    transportLayer: ITransport
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
    tlsCertificate?: TlsCertificate
    createOwnPeerDescriptor: (connectivityResponse: ConnectivityResponse) => PeerDescriptor
}

export class DefaultConnectorFacade implements ConnectorFacade {

    private readonly config: DefaultConnectorFacadeConfig
    private ownPeerDescriptor?: PeerDescriptor
    private webSocketConnector?: WebSocketConnector
    private webrtcConnector?: WebRtcConnector

    constructor(config: DefaultConnectorFacadeConfig) {
        this.config = config
    }

    async start(
        onIncomingConnection: (connection: ManagedConnection) => boolean,
        canConnect: (peerDescriptor: PeerDescriptor) => boolean
    ): Promise<void> {
        logger.trace(`Creating WebSocketConnector`)
        this.webSocketConnector = new WebSocketConnector(
            ConnectionManager.PROTOCOL_VERSION,
            this.config.transportLayer!,
            (peerDescriptor: PeerDescriptor) => canConnect(peerDescriptor),  // TODO shoulw we use canConnect also for WebRtcConnector? (NET-1142)
            onIncomingConnection,
            this.config.websocketPortRange,
            this.config.websocketHost,
            this.config.entryPoints,
            this.config.tlsCertificate
        )
        logger.trace(`Creating WebRTCConnector`)
        this.webrtcConnector = new WebRtcConnector({
            rpcTransport: this.config.transportLayer!,
            protocolVersion: ConnectionManager.PROTOCOL_VERSION,
            iceServers: this.config.iceServers,
            allowPrivateAddresses: this.config.webrtcAllowPrivateAddresses,
            bufferThresholdLow: this.config.webrtcDatachannelBufferThresholdLow,
            bufferThresholdHigh: this.config.webrtcDatachannelBufferThresholdHigh,
            connectionTimeout: this.config.webrtcNewConnectionTimeout,
            externalIp: this.config.externalIp,
            portRange: this.config.webrtcPortRange
        }, onIncomingConnection)
        await this.webSocketConnector.start()
        const connectivityResponse = await this.webSocketConnector.checkConnectivity()
        const ownPeerDescriptor = this.config.createOwnPeerDescriptor(connectivityResponse)
        this.ownPeerDescriptor = ownPeerDescriptor
        this.webSocketConnector.setOwnPeerDescriptor(ownPeerDescriptor)
        this.webrtcConnector.setOwnPeerDescriptor(ownPeerDescriptor)
    }

    createConnection(peerDescriptor: PeerDescriptor): ManagedConnection {
        if (this.canOpenWsConnection(peerDescriptor)) {
            return this.webSocketConnector!.connect(peerDescriptor)
        } else {
            return this.webrtcConnector!.connect(peerDescriptor)
        }
    }

    private canOpenWsConnection(peerDescriptor: PeerDescriptor): boolean {
        return this.webSocketConnector!.isPossibleToFormConnection(peerDescriptor)
    }

    getOwnPeerDescriptor(): PeerDescriptor | undefined {
        return this.ownPeerDescriptor
    }

    async stop(): Promise<void> {
        await this.webSocketConnector!.destroy()
        await this.webrtcConnector!.stop()
        // TODO could move this to NodeWebRtcConnection
        WEB_RTC_CLEANUP.cleanUp()
    }
}

export class SimulatorConnectorFacade implements ConnectorFacade {

    private readonly ownPeerDescriptor: PeerDescriptor
    private simulatorConnector?: SimulatorConnector
    private simulator: Simulator

    constructor(ownPeerDescriptor: PeerDescriptor, simulator: Simulator) {
        this.ownPeerDescriptor = ownPeerDescriptor
        this.simulator = simulator
    }

    async start(onIncomingConnection: (connection: ManagedConnection) => boolean): Promise<void> {
        logger.trace(`Creating SimulatorConnector`)
        this.simulatorConnector = new SimulatorConnector(
            ConnectionManager.PROTOCOL_VERSION,
            this.ownPeerDescriptor,
            this.simulator,
            onIncomingConnection
        )
        this.simulator.addConnector(this.simulatorConnector)
    }

    createConnection(peerDescriptor: PeerDescriptor): ManagedConnection {
        return this.simulatorConnector!.connect(peerDescriptor)
    }

    getOwnPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor
    }

    async stop(): Promise<void> {
        await this.simulatorConnector!.stop()
    }
}
