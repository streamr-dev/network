import { ConnectionType } from '../IConnection'

import {
    HandshakeError,
    PeerDescriptor,
} from '../../proto/packages/dht/protos/DhtRpc'
import { Logger } from '@streamr/utils'
import { ManagedConnection } from '../ManagedConnection'
import { Simulator } from './Simulator'
import { SimulatorConnection } from './SimulatorConnection'
import { getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { NodeID } from '../../helpers/nodeId'

const logger = new Logger(module)

export class SimulatorConnector {

    private connectingConnections: Map<NodeID, ManagedConnection> = new Map()
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
            return existingConnection
        }

        const connection = new SimulatorConnection(this.localPeerDescriptor, targetPeerDescriptor, ConnectionType.SIMULATOR_CLIENT, this.simulator)

        const managedConnection = new ManagedConnection(this.localPeerDescriptor, ConnectionType.SIMULATOR_CLIENT, connection, undefined)
        managedConnection.setRemotePeerDescriptor(targetPeerDescriptor)

        this.connectingConnections.set(nodeId, managedConnection)
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
        logger.trace(getNodeIdFromPeerDescriptor(sourceConnection.localPeerDescriptor) + ' incoming connection, stopped: ' + this.stopped)
        if (this.stopped) {
            return
        }
        const connection = new SimulatorConnection(this.localPeerDescriptor,
            sourceConnection.localPeerDescriptor, ConnectionType.SIMULATOR_SERVER, this.simulator)

        const managedConnection = new ManagedConnection(this.localPeerDescriptor, ConnectionType.SIMULATOR_SERVER, undefined, connection)

        logger.trace('connected')

        managedConnection.once('handshakeRequest', () => {
            logger.trace(getNodeIdFromPeerDescriptor(sourceConnection.localPeerDescriptor) + ' incoming handshake request')

            if (this.onNewConnection(managedConnection)) {
                logger.trace(getNodeIdFromPeerDescriptor(sourceConnection.localPeerDescriptor) + ' calling acceptHandshake')
                managedConnection.acceptHandshake()
            } else {
                managedConnection.rejectHandshake(HandshakeError.DUPLICATE_CONNECTION)
            }
        })

        this.simulator.accept(sourceConnection, connection)
    }

    public async stop(): Promise<void> {
        this.stopped = true
        const conns = Array.from(this.connectingConnections.values())
        await Promise.allSettled(conns.map((conn) =>
            conn.close(false)
        ))
    }
}
