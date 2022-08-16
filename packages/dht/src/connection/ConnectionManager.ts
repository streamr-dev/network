import EventEmitter from 'events'
import {
    ConnectivityResponseMessage,
    Message,
    MessageType,
    PeerDescriptor
} from '../proto/DhtRpc'
import { WebSocketConnector } from './WebSocket/WebSocketConnector'
import { PeerID, PeerIDKey } from '../helpers/PeerID'
import { Event, ITransport } from '../transport/ITransport'
import { WebRtcConnector } from './WebRTC/WebRtcConnector'
import { Logger } from '@streamr/utils'
import * as Err from '../helpers/errors'
import { WEB_RTC_CLEANUP } from './WebRTC/NodeWebRtcConnection'
import { ManagedConnection } from './ManagedConnection'
import { Event as ManagedConnectionEvents } from './IManagedConnection'
import { Event as ManagedConnectionSourceEvents } from './IManagedConnectionSource'

export interface ConnectionManagerConfig {
    transportLayer: ITransport
    webSocketHost?: string
    webSocketPort?: number
    entryPoints?: PeerDescriptor[]
}

export enum NatType {
    OPEN_INTERNET = 'open_internet',
    UNKNOWN = 'unknown'
}

export type PeerDescriptorGeneratorCallback = (connectivityResponse: ConnectivityResponseMessage) => PeerDescriptor

const DEFAULT_DISCONNECTION_TIMEOUT = 10000
const logger = new Logger(module)

export class ConnectionManager extends EventEmitter implements ITransport {
    public static PROTOCOL_VERSION = '1.0'
    private stopped = false
    private started = false

    private ownPeerDescriptor: PeerDescriptor | null = null
    private connections: Map<PeerIDKey, ManagedConnection> = new Map()

    private disconnectionTimeouts: Map<PeerIDKey, NodeJS.Timeout> = new Map()
    private webSocketConnector: WebSocketConnector
    private webrtcConnector: WebRtcConnector

    constructor(private config: ConnectionManagerConfig) {
        super()

        logger.trace(`Creating WebSocket Connector`)
        this.webSocketConnector = new WebSocketConnector(this.config.transportLayer, 
            this.canConnect.bind(this), this.config.webSocketPort, this.config.webSocketHost, this.config.entryPoints)
        
        logger.trace(`Creating WebRTC Connector`)
        this.webrtcConnector = new WebRtcConnector({
            rpcTransport: this.config.transportLayer
        })
    }

    public async start(peerDescriptorGeneratorCallback: PeerDescriptorGeneratorCallback): Promise<void> {
        if (this.started || this.stopped) {
            throw new Err.CouldNotStart(`Cannot start already ${this.started ? 'started' : 'stopped'} module`)
        }
        this.started = true
        logger.info(`Starting ConnectionManager...`)

        await this.webSocketConnector.start()

        const connectivityResponse = await this.webSocketConnector.checkConnectivity()

        const ownPeerDescriptor = peerDescriptorGeneratorCallback(connectivityResponse)
        this.ownPeerDescriptor = ownPeerDescriptor

        this.webSocketConnector!.setOwnPeerDescriptor(ownPeerDescriptor)
        this.webSocketConnector.on(ManagedConnectionSourceEvents.CONNECTED, (connection: ManagedConnection) => {
            this.onNewConnection(connection)
        })

        this.webrtcConnector.setOwnPeerDescriptor(ownPeerDescriptor)

        this.webrtcConnector.on(ManagedConnectionSourceEvents.CONNECTED, (connection: ManagedConnection) => {
            this.onNewConnection(connection)
        })
    }

    public async stop(): Promise<void> {
        if (!this.started) {
            return
        }
        this.stopped = true
        logger.trace(`Stopping ConnectionManager`)
        this.removeAllListeners();
        [...this.disconnectionTimeouts.values()].map(async (timeout) => {
            clearTimeout(timeout)
        })
        this.disconnectionTimeouts.clear()
        await this.webSocketConnector.stop()
        this.webrtcConnector.stop()

        this.connections.forEach((connection) => connection.close())
        WEB_RTC_CLEANUP.cleanUp()
    }

    public async send(message: Message, peerDescriptor: PeerDescriptor): Promise<void> {
        if (!this.started || this.stopped) {
            return
        }
        const hexId = PeerID.fromValue(peerDescriptor.peerId).toMapKey()
        if (PeerID.fromValue(this.ownPeerDescriptor!.peerId).equals(PeerID.fromValue(peerDescriptor.peerId))) {
            throw new Err.CannotConnectToSelf('Cannot send to self')
        }
        logger.trace(`Sending message to: ${peerDescriptor.peerId.toString()}`)

        if (this.connections.has(hexId)) {
            this.connections.get(hexId)!.send(Message.toBinary(message))
        } else {
            let connection: ManagedConnection | undefined
            if (peerDescriptor.websocket) {
                connection = this.webSocketConnector!.connect({
                    ownPeerDescriptor: this.ownPeerDescriptor!,
                    targetPeerDescriptor: peerDescriptor,
                    host: peerDescriptor.websocket.ip,
                    port: peerDescriptor.websocket.port,
                })
            } else if (this.ownPeerDescriptor!.websocket && !peerDescriptor.websocket) {
                connection = this.webSocketConnector!.connect({
                    ownPeerDescriptor: this.ownPeerDescriptor!,
                    targetPeerDescriptor: peerDescriptor
                })
            } else if (this.webrtcConnector) {
                connection = this.webrtcConnector.connect(peerDescriptor)
            }
            if (connection) {
                this.onNewConnection(connection)
                connection.send(Message.toBinary(message))
            }
        }
    }

    public disconnect(peerDescriptor: PeerDescriptor, reason?: string, timeout = DEFAULT_DISCONNECTION_TIMEOUT): void {
        if (!this.started || this.stopped) {
            return
        }
        const hexId = PeerID.fromValue(peerDescriptor.peerId).toMapKey()
        this.disconnectionTimeouts.set(hexId, setTimeout(() => {
            this.closeConnection(hexId, reason)
            this.disconnectionTimeouts.delete(hexId)
        }, timeout))
    }

    public getConnection(peerDescriptor: PeerDescriptor): ManagedConnection | null {
        const hexId = PeerID.fromValue(peerDescriptor.peerId).toMapKey()
        return this.connections.get(hexId) || null
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor!
    }

    public hasConnection(peerDescriptor: PeerDescriptor): boolean {
        const hexId = PeerID.fromValue(peerDescriptor.peerId).toMapKey()
        return this.connections.has(hexId)
    }

    public canConnect(peerDescriptor: PeerDescriptor, _ip: string, _port: number): boolean {
        // Perhaps the connection's state should be checked here
        return !this.hasConnection(peerDescriptor) // TODO: Add port range check
    }

    private onData = (data: Uint8Array, peerDescriptor: PeerDescriptor) => {
        try {
            const message = Message.fromBinary(data)
            logger.trace('Received message of type ' + message.messageType)
            if (message.messageType === MessageType.RPC) {
                this.emit(Event.DATA, message, peerDescriptor)
            } else {
                logger.trace('Filtered out message of type ' + message.messageType)
            }
        } catch (e) {
            logger.error('Parsing "Message" from protobuf failed')
        }
    }

    private onNewConnection = (connection: ManagedConnection) => {
        if (!this.started || this.stopped) {
            return
        }

        connection.on(ManagedConnectionEvents.DATA, this.onData) 

        this.connections.set(PeerID.fromValue(connection.getPeerDescriptor()!.peerId).toMapKey(), connection)
    }

    private closeConnection(id: PeerIDKey, reason?: string): void {
        if (!this.started || this.stopped) {
            return
        }
        if (this.connections.has(id)) {
            logger.trace(`Disconnecting from Peer ${id}${reason ? `: ${reason}` : ''}`)
            this.connections.get(id)!.close()
        }
    }
}
