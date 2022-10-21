/* eslint-disable @typescript-eslint/prefer-for-of */

import { EventEmitter } from 'eventemitter3'
import {
    ConnectivityResponseMessage,
    LockRequest, LockResponse,
    Message,
    MessageType,
    PeerDescriptor,
    UnlockRequest
} from '../proto/DhtRpc'
import { WebSocketConnector } from './WebSocket/WebSocketConnector'
import { PeerID, PeerIDKey } from '../helpers/PeerID'
import { ITransport, TransportEvents } from '../transport/ITransport'
import { WebRtcConnector } from './WebRTC/WebRtcConnector'
import { Logger } from '@streamr/utils'
import * as Err from '../helpers/errors'
import { WEB_RTC_CLEANUP } from './WebRTC/NodeWebRtcConnection'
import { ManagedConnection } from './ManagedConnection'
import { RoutingRpcCommunicator } from '../transport/RoutingRpcCommunicator'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { ConnectionLockerClient } from '../proto/DhtRpc.client'
import { RemoteConnectionLocker } from './RemoteConnectionLocker'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Empty } from '../proto/google/protobuf/empty'
import { Simulator } from './Simulator/Simulator'
import { SimulatorConnector } from './Simulator/SimulatorConnector'
import { DuplicateDetector } from '../dht/DuplicateDetector'

export interface ConnectionManagerConfig {
    transportLayer?: ITransport
    webSocketHost?: string
    webSocketPort?: number
    entryPoints?: PeerDescriptor[]
    // the following fields are used in simulation only
    simulator?: Simulator
    ownPeerDescriptor?: PeerDescriptor
    serviceIdPrefix?: string
}

export enum NatType {
    OPEN_INTERNET = 'open_internet',
    UNKNOWN = 'unknown'
}

type ServiceId = string

export type PeerDescriptorGeneratorCallback = (connectivityResponse: ConnectivityResponseMessage) => PeerDescriptor

const DEFAULT_DISCONNECTION_TIMEOUT = 15000
const logger = new Logger(module)

interface ConnectionManagerEvents {
    newConnection: (connection: ManagedConnection) => void
}

export interface ConnectionLocker {
    lockConnection(targetDescriptor: PeerDescriptor, serviceId: string): void
    unlockConnection(targetDescriptor: PeerDescriptor, serviceId: string): void
}

export type Events = TransportEvents & ConnectionManagerEvents

export class ConnectionManager extends EventEmitter<Events> implements ITransport, ConnectionLocker {
    public static PROTOCOL_VERSION = '1.0'
    private stopped = false
    private started = false

    private ownPeerDescriptor?: PeerDescriptor
    private connections: Map<PeerIDKey, ManagedConnection> = new Map()
    private readonly messageDuplicateDetector: DuplicateDetector = new DuplicateDetector()

    private disconnectionTimeouts: Map<PeerIDKey, NodeJS.Timeout> = new Map()

    private webSocketConnector?: WebSocketConnector
    private webrtcConnector?: WebRtcConnector
    private simulatorConnector?: SimulatorConnector

    private localLockedConnections: Map<PeerIDKey, Set<ServiceId>> = new Map()
    private remoteLockedConnections: Map<PeerIDKey, Set<ServiceId>> = new Map()

    private serviceId: string
    private rpcCommunicator?: RoutingRpcCommunicator

    constructor(private config: ConnectionManagerConfig) {
        super()

        if (this.config.simulator) {
            logger.trace(`Creating SimulatorConnector`)
            this.simulatorConnector = new SimulatorConnector(ConnectionManager.PROTOCOL_VERSION,
                this.config.ownPeerDescriptor!, this.config.simulator)
            this.config.simulator.addConnector(this.simulatorConnector)
            this.ownPeerDescriptor = this.config.ownPeerDescriptor
            this.simulatorConnector!.on('newConnection', (connection: ManagedConnection) => {
                this.onNewConnection(connection)
            })
            this.started = true

        } else {
            logger.trace(`Creating WebSocketConnector`)
            this.webSocketConnector = new WebSocketConnector(ConnectionManager.PROTOCOL_VERSION, this.config.transportLayer!,
                this.canConnect.bind(this), this.config.webSocketPort, this.config.webSocketHost,
                this.config.entryPoints)

            logger.trace(`Creating WebRTCConnector`)
            this.webrtcConnector = new WebRtcConnector({
                rpcTransport: this.config.transportLayer!,
                protocolVersion: ConnectionManager.PROTOCOL_VERSION
            })
        }

        this.serviceId = (this.config.serviceIdPrefix ? this.config.serviceIdPrefix : '') + 'ConnectionManager'
        this.rpcCommunicator = new RoutingRpcCommunicator(this.serviceId, this.send, {
            rpcRequestTimeout: 10000
        })

        this.lockRequest = this.lockRequest.bind(this)
        this.unlockRequest = this.unlockRequest.bind(this)

        this.rpcCommunicator.registerRpcMethod(LockRequest, LockResponse, 'lockRequest', this.lockRequest)
        this.rpcCommunicator.registerRpcNotification(UnlockRequest, 'unlockRequest', this.unlockRequest)
    }

    public async start(peerDescriptorGeneratorCallback?: PeerDescriptorGeneratorCallback): Promise<void> {
        if (this.started || this.stopped) {
            throw new Err.CouldNotStart(`Cannot start already ${this.started ? 'started' : 'stopped'} module`)
        }
        this.started = true
        logger.info(`Starting ConnectionManager...`)

        if (!this.config.simulator) {
            await this.webSocketConnector!.start()

            const connectivityResponse = await this.webSocketConnector!.checkConnectivity()

            const ownPeerDescriptor = peerDescriptorGeneratorCallback!(connectivityResponse)
            this.ownPeerDescriptor = ownPeerDescriptor

            this.webSocketConnector!.setOwnPeerDescriptor(ownPeerDescriptor)
            this.webSocketConnector!.on('newConnection', (connection: ManagedConnection) => {
                this.onNewConnection(connection)
            })

            this.webrtcConnector!.setOwnPeerDescriptor(ownPeerDescriptor)

            this.webrtcConnector!.on('newConnection', (connection: ManagedConnection) => {
                this.onNewConnection(connection)
            })
        }
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

        if (!this.config.simulator) {
            await this.webSocketConnector!.stop()
            this.webrtcConnector!.stop()
        }

        this.connections.forEach((connection) => connection.close())
        WEB_RTC_CLEANUP.cleanUp()
    }

    public send = async (message: Message): Promise<void> => {
        if (!this.started || this.stopped) {
            return
        }
        const peerDescriptor = message.targetDescriptor!

        const hexId = PeerID.fromValue(peerDescriptor.peerId).toKey()
        if (PeerID.fromValue(this.ownPeerDescriptor!.peerId).equals(PeerID.fromValue(peerDescriptor.peerId))) {
            throw new Err.CannotConnectToSelf('Cannot send to self')
        }
        logger.trace(`Sending message to: ${peerDescriptor.peerId.toString()}`)

        if (!(message.targetDescriptor)) {
            message = ({ ...message, targetDescriptor: peerDescriptor })
        }

        if (!(message.sourceDescriptor)) {
            message = ({ ...message, sourceDescriptor: this.ownPeerDescriptor })
        }

        if (this.connections.has(hexId)) {
            this.connections.get(hexId)!.send(Message.toBinary(message))
        } else {
            let connection: ManagedConnection | undefined

            if (this.simulatorConnector) {
                connection = this.simulatorConnector!.connect(peerDescriptor)
            } else if (peerDescriptor.websocket || this.ownPeerDescriptor!.websocket) {
                connection = this.webSocketConnector!.connect(peerDescriptor)
            } else {
                connection = this.webrtcConnector!.connect(peerDescriptor)
            }

            this.onNewConnection(connection)
            connection.send(Message.toBinary(message))
        }
    }

    public disconnect(peerDescriptor: PeerDescriptor, reason?: string, timeout = DEFAULT_DISCONNECTION_TIMEOUT): void {
        if (!this.started || this.stopped) {
            return
        }
        const hexId = PeerID.fromValue(peerDescriptor.peerId).toKey()
        this.disconnectionTimeouts.set(hexId, setTimeout(() => {
            this.closeConnection(hexId, reason)
            this.disconnectionTimeouts.delete(hexId)
        }, timeout))
    }

    public getConnection(peerDescriptor: PeerDescriptor): ManagedConnection | undefined {
        const hexId = PeerID.fromValue(peerDescriptor.peerId).toKey()
        return this.connections.get(hexId)
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor!
    }

    public hasConnection(peerDescriptor: PeerDescriptor): boolean {
        const hexId = PeerID.fromValue(peerDescriptor.peerId).toKey()
        return this.connections.has(hexId)
    }

    public hasLocalLockedConnection(peerDescriptor: PeerDescriptor, serviceId?: ServiceId): boolean {
        const hexId = PeerID.fromValue(peerDescriptor.peerId).toKey()
        if (!serviceId) {
            return this.localLockedConnections.has(hexId)
        } else {
            return this.localLockedConnections.has(hexId) ? this.localLockedConnections.get(hexId)!.has(serviceId) : false
        }
    }

    public hasRemoteLockedConnection(peerDescriptor: PeerDescriptor, serviceId?: ServiceId): boolean {
        const hexId = PeerID.fromValue(peerDescriptor.peerId).toKey()
        if (!serviceId) {
            return this.remoteLockedConnections.has(hexId)
        } else {
            return this.remoteLockedConnections.has(hexId) ? this.remoteLockedConnections.get(hexId)!.has(serviceId) : false
        }
    }

    public canConnect(peerDescriptor: PeerDescriptor, _ip: string, _port: number): boolean {
        // Perhaps the connection's state should be checked here
        return !this.hasConnection(peerDescriptor) // TODO: Add port range check
    }

    private handleMessage(message: Message) {
        logger.trace('Received message of type ' + message!.messageType)

        if (message!.messageType !== MessageType.RPC) {
            logger.trace('Filtered out non-RPC message of type ' + message!.messageType)
            return
        }

        if (this.messageDuplicateDetector.isMostLikelyDuplicate(message.messageId)) {
            return
        }

        this.messageDuplicateDetector.add(message.messageId)

        if (message.serviceId == this.serviceId) {
            this.rpcCommunicator?.handleMessageFromPeer(message)
        } else {
            this.emit('message', message)
        }
    }

    public onData = (data: Uint8Array, peerDescriptor: PeerDescriptor): void => {
        // This method parsed incoming data to Messages
        // and ensures they are meant to us
        // ToDo: add signature checking and decryption here 

        if (!this.started || this.stopped) {
            return
        }
        try {
            let message: Message | undefined
            try {
                message = Message.fromBinary(data)
            } catch (e1) {
                logger.error('Parsing incoming data into Message failed' + e1)
                return
            }
            message.sourceDescriptor = peerDescriptor
            this.handleMessage(message)

        } catch (e) {
            logger.error('Handling incoming data failed ' + e)
        }
    }

    private onConnected = (connection: ManagedConnection) => {
        this.emit('connected', connection.getPeerDescriptor()!)
        logger.trace('connectedPeerId: ' + connection.getPeerDescriptor()!.peerId)
    }

    private onDisconnected = (connection: ManagedConnection) => {
        this.closeConnection(PeerID.fromValue(connection.getPeerDescriptor()!.peerId).toKey())
        this.emit('disconnected', connection.getPeerDescriptor()!)
    }

    private onNewConnection = (connection: ManagedConnection) => {
        if (!this.started || this.stopped) {
            return
        }
        logger.trace('onNewConnection() objectId ' + connection.objectId)

        const newPeerID = PeerID.fromValue(connection.getPeerDescriptor()!.peerId)

        if (this.connections.has(newPeerID.toKey())) {
            if (newPeerID.hasSmallerHashThan(
                PeerID.fromValue(this.ownPeerDescriptor!.peerId))) {
                // replace the current connection
                const oldConnection = this.connections.get(newPeerID.toKey())
                const buffer = oldConnection!.getOutputBuffer()

                for (let i = 0; i < buffer.length; i++) {
                    connection.send(buffer[i])
                }
                oldConnection!.close()
            } else {
                connection.close()
                return
            }
        }

        connection.on('managedData', this.onData)
        if (connection.isHandshakeCompleted()) {
            this.onConnected(connection)
        } else {
            connection.once('handshakeCompleted', (_peerDescriptor: PeerDescriptor) => {
                this.onConnected(connection)
            })
        }
        connection.on('disconnected', (_code?: number, _reason?: string) => {
            this.onDisconnected(connection)
        })

        this.connections.set(PeerID.fromValue(connection.getPeerDescriptor()!.peerId).toKey(), connection)

        this.emit('newConnection', connection)
    }

    private closeConnection(id: PeerIDKey, reason?: string): void {
        if (!this.started || this.stopped) {
            return
        }
        if (this.connections.has(id)) {
            logger.trace(`Disconnecting from Peer ${id}${reason ? `: ${reason}` : ''}`)
            const connectionToClose = this.connections.get(id)!
            this.connections.delete(id)
            connectionToClose.close()
        }
    }

    private clearDisconnectionTimeout(hexId: PeerIDKey): void {
        if (this.disconnectionTimeouts.has(hexId)) {
            clearTimeout(this.disconnectionTimeouts.get(hexId))
            this.disconnectionTimeouts.delete(hexId)
        }
    }

    public lockConnection(targetDescriptor: PeerDescriptor, serviceId: ServiceId): void {
        const hexKey = PeerID.fromValue(targetDescriptor.peerId).toKey()
        this.clearDisconnectionTimeout(hexKey)
        const remoteConnectionLocker = new RemoteConnectionLocker(
            targetDescriptor,
            ConnectionManager.PROTOCOL_VERSION,
            toProtoRpcClient(new ConnectionLockerClient(this.rpcCommunicator!.getRpcClientTransport()))
        )
        if (!this.localLockedConnections.has(hexKey)) {
            const newSet = new Set<ServiceId>()
            newSet.add(serviceId)
            this.localLockedConnections.set(hexKey, newSet)
        } else if (!this.localLockedConnections.get(hexKey)?.has(serviceId)) {
            this.localLockedConnections.get(hexKey)?.add(serviceId)
        }

        remoteConnectionLocker.lockRequest(this.ownPeerDescriptor!, serviceId)
            .then((_accepted) => logger.trace('LockRequest successful'))
            .catch((err) => { logger.error(err) })
    }

    public unlockConnection(targetDescriptor: PeerDescriptor, serviceId: ServiceId): void {
        const hexKey = PeerID.fromValue(targetDescriptor.peerId).toKey()
        this.localLockedConnections.get(hexKey)?.delete(serviceId)

        const remoteConnectionLocker = new RemoteConnectionLocker(
            targetDescriptor,
            ConnectionManager.PROTOCOL_VERSION,
            toProtoRpcClient(new ConnectionLockerClient(this.rpcCommunicator!.getRpcClientTransport()))
        )

        remoteConnectionLocker.unlockRequest(this.ownPeerDescriptor!, serviceId)

        if (this.localLockedConnections.get(hexKey)?.size === 0) {
            this.localLockedConnections.delete(hexKey)
            if (!this.hasRemoteLockedConnection(targetDescriptor)) {
                this.disconnect(targetDescriptor, 'connection is no longer locked by any services')
            }
        }
    }

    public getAllConnectionPeerDescriptors(): PeerDescriptor[] {
        return [...this.connections.values()]
            .filter((managedConnection: ManagedConnection) => managedConnection.isHandshakeCompleted())
            .map((managedConnection: ManagedConnection) => managedConnection.getPeerDescriptor()! as PeerDescriptor)
    }

    // IConnectionLocker server implementation
    private async lockRequest(lockRequest: LockRequest, _context: ServerCallContext): Promise<LockResponse> {
        const hexKey = PeerID.fromValue(lockRequest.peerDescriptor!.peerId).toKey()
        this.clearDisconnectionTimeout(hexKey)
        if (!this.remoteLockedConnections.has(hexKey)) {
            const newSet = new Set<string>()
            newSet.add(lockRequest.serviceId)
            this.remoteLockedConnections.set(hexKey, newSet)
        } else if (!this.remoteLockedConnections.get(hexKey)?.has(lockRequest.serviceId)) {
            this.remoteLockedConnections.get(hexKey)?.add(lockRequest.serviceId)
        }
        const response: LockResponse = {
            accepted: true
        }
        return response
    }

    // IConnectionLocker server implementation
    private async unlockRequest(unlockRequest: UnlockRequest, _context: ServerCallContext): Promise<Empty> {
        const hexKey = PeerID.fromValue(unlockRequest.peerDescriptor!.peerId).toKey()
        this.remoteLockedConnections.get(hexKey)?.delete(unlockRequest.serviceId)
        if (this.remoteLockedConnections.get(hexKey)?.size === 0) {
            this.remoteLockedConnections.delete(hexKey)
            if (!this.hasLocalLockedConnection(unlockRequest.peerDescriptor!)) {
                this.disconnect(unlockRequest.peerDescriptor!, 'connection is no longer locked by any services')
            }
        }
        return {}
    }
}
