import { ConnectionType } from '../IConnection'

import {
    HandshakeError,
    PeerDescriptor,
} from '../../proto/packages/dht/protos/DhtRpc'
import { Logger } from '@streamr/utils'
import { ManagedConnection } from '../ManagedConnection'
import { Simulator } from './Simulator'
import { SimulatorConnection } from './SimulatorConnection'
import { DhtAddress, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { acceptHandshake, createIncomingHandshaker, createOutgoingHandshaker, Handshaker, rejectHandshake } from '../Handshaker'

const logger = new Logger(module)

interface ConnectingConnection {
    connection: ManagedConnection
    handshaker: Handshaker
}
export class SimulatorConnector {

    private connectingConnections: Map<DhtAddress, ConnectingConnection> = new Map()
    private stopped = false
    private localPeerDescriptor: PeerDescriptor
    private simulator: Simulator
    private onNewConnection: (connection: ManagedConnection) => boolean

    constructor(
        localPeerDescriptor: PeerDescriptor,
        simulator: Simulator,
        onNewConnection: (connection: ManagedConnection) => boolean
    ) {
        this.localPeerDescriptor = localPeerDescriptor
        this.simulator = simulator
        this.onNewConnection = onNewConnection
    }

    public connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        logger.trace('connect() ' + getNodeIdFromPeerDescriptor(targetPeerDescriptor))
        const nodeId = getNodeIdFromPeerDescriptor(targetPeerDescriptor)
        const existingConnection = this.connectingConnections.get(nodeId)
        if (existingConnection) {
            return existingConnection.connection
        }

        const connection = new SimulatorConnection(this.localPeerDescriptor, targetPeerDescriptor, ConnectionType.SIMULATOR_CLIENT, this.simulator)

        const managedConnection = new ManagedConnection(ConnectionType.SIMULATOR_CLIENT)
        managedConnection.setRemotePeerDescriptor(targetPeerDescriptor)
        const handshaker = createOutgoingHandshaker(this.localPeerDescriptor, managedConnection, connection, targetPeerDescriptor)
        this.connectingConnections.set(nodeId, {
            connection: managedConnection,
            handshaker,
        })
        connection.once('disconnected', () => {
            this.connectingConnections.delete(nodeId)
        })
        connection.once('connected', () => {
            this.connectingConnections.delete(nodeId)
        })

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
                acceptHandshake(managedConnection, connection, handshaker, sourceConnection.localPeerDescriptor)
            } else {
                rejectHandshake(managedConnection, connection, handshaker, HandshakeError.DUPLICATE_CONNECTION)
            }
        })

        this.simulator.accept(sourceConnection, connection)
    }

    public async stop(): Promise<void> {
        this.stopped = true
        const conns = Array.from(this.connectingConnections.values())
        await Promise.allSettled(conns.map(async (conn) => {
            conn.handshaker.stop()
            await conn.connection.close(false)
        }))
    }
}
