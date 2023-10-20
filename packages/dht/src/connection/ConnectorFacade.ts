import { Logger, MetricsContext } from '@streamr/utils'
import {
    ConnectivityResponse,
    NodeType,
    PeerDescriptor
} from '../proto/packages/dht/protos/DhtRpc'
import { ITransport } from '../transport/ITransport'
import { ManagedConnection } from './ManagedConnection'
import { IceServer, WebRtcConnector } from './WebRTC/WebRtcConnector'
import { WebSocketConnector } from './WebSocket/WebSocketConnector'
import { ConnectionManager, PortRange, TlsCertificate } from './ConnectionManager'
import { SimulatorConnector } from './Simulator/SimulatorConnector'
import { Simulator } from './Simulator/Simulator'
import { isPrivateIPv4 } from '../helpers/AddressTools'
import { WEB_RTC_CLEANUP } from './WebRTC/NodeWebRtcConnection'

export interface ConnectorFacade {
    createConnection: (peerDescriptor: PeerDescriptor) => ManagedConnection
    getOwnPeerDescriptor: () => PeerDescriptor | undefined
    start: () => Promise<void>
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
    private webSocketConnector: WebSocketConnector
    private webrtcConnector: WebRtcConnector

    constructor(
        config: DefaultConnectorFacadeConfig,
        incomingConnectionCallback: (connection: ManagedConnection) => boolean,
        canConnect: (peerDescriptor: PeerDescriptor) => boolean
    ) {
        this.config = config
        logger.trace(`Creating WebSocketConnector`)
        this.webSocketConnector = new WebSocketConnector(
            ConnectionManager.PROTOCOL_VERSION,
            config.transportLayer!,
            (peerDescriptor: PeerDescriptor) => canConnect(peerDescriptor),  // TODO why canConnect is not used WebRtcConnector
            incomingConnectionCallback,
            config.websocketPortRange,
            config.websocketHost,
            config.entryPoints,
            config.tlsCertificate
        )
        logger.trace(`Creating WebRTCConnector`)
        this.webrtcConnector = new WebRtcConnector({
            rpcTransport: config.transportLayer!,
            protocolVersion: ConnectionManager.PROTOCOL_VERSION,
            iceServers: config.iceServers,
            allowPrivateAddresses: config.webrtcAllowPrivateAddresses,
            bufferThresholdLow: config.webrtcDatachannelBufferThresholdLow,
            bufferThresholdHigh: config.webrtcDatachannelBufferThresholdHigh,
            connectionTimeout: config.webrtcNewConnectionTimeout,
            externalIp: config.externalIp,
            portRange: config.webrtcPortRange
        }, incomingConnectionCallback)
    }

    async start() {
        await this.webSocketConnector.start()
        const connectivityResponse = await this.webSocketConnector.checkConnectivity()
        const ownPeerDescriptor = this.config.createOwnPeerDescriptor(connectivityResponse)
        this.ownPeerDescriptor = ownPeerDescriptor
        this.webSocketConnector.setOwnPeerDescriptor(ownPeerDescriptor)
        this.webrtcConnector.setOwnPeerDescriptor(ownPeerDescriptor)
    }

    createConnection(peerDescriptor: PeerDescriptor): ManagedConnection {
        if (this.canOpenWsConnection(peerDescriptor)) {
            return this.webSocketConnector.connect(peerDescriptor)
        } else {
            return this.webrtcConnector.connect(peerDescriptor)
        }
    }

    private canOpenWsConnection(peerDescriptor: PeerDescriptor): boolean {
        if ((peerDescriptor.websocket || this.ownPeerDescriptor!.websocket)) {
        if (!(this.ownPeerDescriptor!.type === NodeType.BROWSER || peerDescriptor.type === NodeType.BROWSER)) {
            return true
        }
        if (this.ownPeerDescriptor!.websocket) {
            return (peerDescriptor.type === NodeType.BROWSER && this.ownPeerDescriptor!.websocket!.tls) 
                || (this.ownPeerDescriptor!.websocket!.host === 'localhost' || (isPrivateIPv4(this.ownPeerDescriptor!.websocket!.host)))
        }
        return (this.ownPeerDescriptor!.type === NodeType.BROWSER && peerDescriptor.websocket!.tls)
            || (peerDescriptor.websocket!.host === 'localhost' || (isPrivateIPv4(peerDescriptor.websocket!.host)))
        } else {
            return false
        }
    }

    getOwnPeerDescriptor(): PeerDescriptor | undefined {
        return this.ownPeerDescriptor
    }

    async stop(): Promise<void> {
        await this.webSocketConnector.destroy()
        await this.webrtcConnector.stop()
        // TODO could move this to NodeWebRtcConnection
        WEB_RTC_CLEANUP.cleanUp()
    }
}

export class SimulatorConnectorFacade implements ConnectorFacade {

    private readonly ownPeerDescriptor: PeerDescriptor
    private simulatorConnector: SimulatorConnector

    constructor(
        ownPeerDescriptor: PeerDescriptor,
        incomingConnectionCallback: (connection: ManagedConnection) => boolean,
        simulator: Simulator
    ) {
        this.ownPeerDescriptor = ownPeerDescriptor
        logger.trace(`Creating SimulatorConnector`)
        this.simulatorConnector = new SimulatorConnector(
            ConnectionManager.PROTOCOL_VERSION,
            ownPeerDescriptor,
            simulator,
            incomingConnectionCallback
        )
        simulator.addConnector(this.simulatorConnector)
        this.ownPeerDescriptor = ownPeerDescriptor
    }

    async start() {
    }

    createConnection(peerDescriptor: PeerDescriptor): ManagedConnection {
        return this.simulatorConnector.connect(peerDescriptor)
    }

    getOwnPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor
    }

    async stop(): Promise<void> {
        await this.simulatorConnector.stop()
    }
}