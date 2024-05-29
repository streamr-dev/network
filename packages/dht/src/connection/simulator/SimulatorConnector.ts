import { ConnectionType, IConnection } from '../IConnection'

import {
    HandshakeError,
    PeerDescriptor,
} from '../../proto/packages/dht/protos/DhtRpc'
import { Logger } from '@streamr/utils'
import { ManagedConnection } from '../ManagedConnection'
import { Simulator } from './Simulator'
import { SimulatorConnection } from './SimulatorConnection'
import { DhtAddress, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { acceptHandshake, createIncomingHandshaker, createOutgoingHandshaker, rejectHandshake } from '../Handshaker'

const logger = new Logger(module)

export class SimulatorConnector {

    private connectingConnections: Map<DhtAddress, ManagedConnection> = new Map()
    private stopped = false
    private localPeerDescriptor: PeerDescriptor
    private simulator: Simulator
    private onNewConnection: (connection: ManagedConnection) => boolean
    private onHandshakeCompleted: (peerDescriptor: PeerDescriptor, connection: IConnection) => void

    constructor(
        localPeerDescriptor: PeerDescriptor,
        simulator: Simulator,
        onNewConnection: (connection: ManagedConnection) => boolean,
        onHandshakeCompleted: (peerDescriptor: PeerDescriptor, connection: IConnection) => void
    ) {
        this.localPeerDescriptor = localPeerDescriptor
        this.simulator = simulator
        this.onNewConnection = onNewConnection
        this.onHandshakeCompleted = (peerDescriptor, connection) => onHandshakeCompleted(peerDescriptor, connection)
    }

    public connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        logger.trace('connect() ' + getNodeIdFromPeerDescriptor(targetPeerDescriptor))
        const nodeId = getNodeIdFromPeerDescriptor(targetPeerDescriptor)
        const existingConnection = this.connectingConnections.get(nodeId)
        if (existingConnection) {
            return existingConnection
        }

        const connection = new SimulatorConnection(this.localPeerDescriptor, targetPeerDescriptor, ConnectionType.SIMULATOR_CLIENT, this.simulator)

        const managedConnection = new ManagedConnection(ConnectionType.SIMULATOR_CLIENT)
        managedConnection.setRemotePeerDescriptor(targetPeerDescriptor)
        createOutgoingHandshaker(this.localPeerDescriptor, managedConnection, connection, this.onHandshakeCompleted, targetPeerDescriptor)
        this.connectingConnections.set(nodeId, managedConnection)
        const delFunc = () => {
            this.connectingConnections.delete(nodeId)
            connection.off('disconnected', delFunc)
            managedConnection.off('connected', delFunc)
            managedConnection.off('disconnected', delFunc)
        }
        connection.once('disconnected', delFunc)
        managedConnection.once('connected', delFunc)
        managedConnection.once('disconnected', delFunc)
        
        connection.connect()
        return managedConnection
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.localPeerDescriptor
    }

    public handleIncomingConnection(sourceConnection: SimulatorConnection): void {
        const localNodeId = getNodeIdFromPeerDescriptor(sourceConnection.localPeerDescriptor)
        logger.trace(localNodeId + ' incoming connection, stopped: ' + this.stopped)
        if (this.stopped) {
            return
        }
        const connection = new SimulatorConnection(this.localPeerDescriptor,
            sourceConnection.localPeerDescriptor, ConnectionType.SIMULATOR_SERVER, this.simulator)

        const managedConnection = new ManagedConnection(ConnectionType.SIMULATOR_SERVER)
        const handshaker = createIncomingHandshaker(this.localPeerDescriptor, managedConnection, connection)
        logger.trace('connected')

        handshaker.once('handshakeRequest', () => {
            logger.trace(localNodeId + ' incoming handshake request')

            if (this.onNewConnection(managedConnection)) {
                logger.trace(localNodeId + ' calling acceptHandshake')
                acceptHandshake(handshaker)
                this.onHandshakeCompleted(sourceConnection.localPeerDescriptor, connection)
            } else {
                rejectHandshake(managedConnection, connection, handshaker, HandshakeError.DUPLICATE_CONNECTION)
            }
        })

        this.simulator.accept(sourceConnection, connection)
    }

    public async stop(): Promise<void> {
        this.stopped = true
        const conns = Array.from(this.connectingConnections.values())
        await Promise.allSettled(conns.map(async (conn) => conn.close(false)))
    }
}
