import { Logger } from '@streamr/utils'
import { ConnectionManager, ConnectionManagerConfig } from './ConnectionManager'
import { SimulatorConnector } from './Simulator/SimulatorConnector'
import { WebSocketConnector } from './WebSocket/WebSocketConnector'
import { WebRtcConnector } from './WebRTC/WebRtcConnector'
import { ManagedConnection } from './ManagedConnection'
import { NodeType, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { isPrivateIPv4 } from '../helpers/AddressTools'

export interface ConnectorFacade {
    createConnection: (peerDescriptor: PeerDescriptor) => ManagedConnection
    getOwnPeerDescriptor: () => PeerDescriptor | undefined
    start: () => Promise<void>
    stop: () => Promise<void>
}

const logger = new Logger(module)

export class DefaultConnectorFacade {

    private readonly config: ConnectionManagerConfig
    private ownPeerDescriptor?: PeerDescriptor
    private webSocketConnector?: WebSocketConnector
    private webrtcConnector?: WebRtcConnector
    private simulatorConnector?: SimulatorConnector

    constructor(
        config: ConnectionManagerConfig,
        incomingConnectionCallback: (connection: ManagedConnection) => boolean,
        canConnect: (peerDescriptor: PeerDescriptor) => boolean
    ) {
        this.config = config
        if (config.simulator) {
            logger.trace(`Creating SimulatorConnector`)
            this.simulatorConnector = new SimulatorConnector(
                ConnectionManager.PROTOCOL_VERSION,
                config.ownPeerDescriptor!,
                config.simulator,
                incomingConnectionCallback
            )
            config.simulator.addConnector(this.simulatorConnector)
            this.ownPeerDescriptor = config.ownPeerDescriptor
            this.state = ConnectionManagerState.RUNNING
        } else {
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
    }

    async start() {
        if (!this.config.simulator) {
            await this.webSocketConnector!.start()
            const connectivityResponse = await this.webSocketConnector!.checkConnectivity()
            const ownPeerDescriptor = this.config.createOwnPeerDescriptor(connectivityResponse)
            this.ownPeerDescriptor = ownPeerDescriptor
            this.webSocketConnector!.setOwnPeerDescriptor(ownPeerDescriptor)
            this.webrtcConnector!.setOwnPeerDescriptor(ownPeerDescriptor)
        }
    }

    createConnection(peerDescriptor: PeerDescriptor): ManagedConnection {
        if (this.simulatorConnector) {
            return this.simulatorConnector.connect(peerDescriptor)
        } else if ((peerDescriptor.websocket || this.ownPeerDescriptor!.websocket)) {
            if (this.canOpenWsConnection(peerDescriptor)) {
                return this.webSocketConnector!.connect(peerDescriptor)
            }
        }
        return this.webrtcConnector!.connect(peerDescriptor)
    }

    private canOpenWsConnection(peerDescriptor: PeerDescriptor): boolean {
        if (!(this.ownPeerDescriptor!.type === NodeType.BROWSER || peerDescriptor.type === NodeType.BROWSER)) {
            return true
        }
        if (this.ownPeerDescriptor!.websocket) {
            return (peerDescriptor.type === NodeType.BROWSER && this.ownPeerDescriptor!.websocket!.tls) 
                || (this.ownPeerDescriptor!.websocket!.host === 'localhost' || (isPrivateIPv4(this.ownPeerDescriptor!.websocket!.host)))
        }
        return (this.ownPeerDescriptor!.type === NodeType.BROWSER && peerDescriptor.websocket!.tls)
            || (peerDescriptor.websocket!.host === 'localhost' || (isPrivateIPv4(peerDescriptor.websocket!.host)))
    }

    getOwnPeerDescriptor(): PeerDescriptor | undefined {
        return this.ownPeerDescriptor
    }

    async stop(): Promise<void> {
        if (!this.config.simulator) {
            await this.webSocketConnector!.destroy()
            this.webSocketConnector = undefined
            await this.webrtcConnector!.stop()
            this.webrtcConnector = undefined
        } else {
            await this.simulatorConnector!.stop()
            this.simulatorConnector = undefined
        }
    }
}