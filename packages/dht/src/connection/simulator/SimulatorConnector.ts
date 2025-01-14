import { ConnectionType } from '../IConnection'

import { HandshakeError, PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'
import { Logger } from '@streamr/utils'
import { Simulator } from './Simulator'
import { SimulatorConnection } from './SimulatorConnection'
import { DhtAddress, toNodeId } from '../../identifiers'
import { acceptHandshake, createIncomingHandshaker, createOutgoingHandshaker, rejectHandshake } from '../Handshaker'
import { PendingConnection } from '../PendingConnection'

const logger = new Logger(module)

export class SimulatorConnector {
    private connectingConnections: Map<DhtAddress, PendingConnection> = new Map()
    private stopped = false
    private localPeerDescriptor: PeerDescriptor
    private simulator: Simulator
    private onNewConnection: (connection: PendingConnection) => boolean

    constructor(
        localPeerDescriptor: PeerDescriptor,
        simulator: Simulator,
        onNewConnection: (connection: PendingConnection) => boolean
    ) {
        this.localPeerDescriptor = localPeerDescriptor
        this.simulator = simulator
        this.onNewConnection = onNewConnection
    }

    public connect(targetPeerDescriptor: PeerDescriptor): PendingConnection {
        logger.trace('connect() ' + toNodeId(targetPeerDescriptor))
        const nodeId = toNodeId(targetPeerDescriptor)
        const existingConnection = this.connectingConnections.get(nodeId)
        if (existingConnection) {
            return existingConnection
        }

        const connection = new SimulatorConnection(
            this.localPeerDescriptor,
            targetPeerDescriptor,
            ConnectionType.SIMULATOR_CLIENT,
            this.simulator
        )

        const pendingConnection = new PendingConnection(targetPeerDescriptor)
        createOutgoingHandshaker(this.localPeerDescriptor, pendingConnection, connection, targetPeerDescriptor)
        this.connectingConnections.set(nodeId, pendingConnection)
        const delFunc = () => {
            this.connectingConnections.delete(nodeId)
            connection.off('disconnected', delFunc)
            pendingConnection.off('connected', delFunc)
            pendingConnection.off('disconnected', delFunc)
        }
        connection.once('disconnected', delFunc)
        pendingConnection.once('connected', delFunc)
        pendingConnection.once('disconnected', delFunc)

        connection.connect()
        return pendingConnection
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.localPeerDescriptor
    }

    public handleIncomingConnection(sourceConnection: SimulatorConnection): void {
        // connection is incoming, so remotePeerDescriptor is localPeerDescriptor
        const remotePeerDescriptor = sourceConnection.localPeerDescriptor
        const remoteNodeId = toNodeId(sourceConnection.localPeerDescriptor)
        logger.trace(remoteNodeId + ' incoming connection, stopped: ' + this.stopped)
        if (this.stopped) {
            return
        }
        const connection = new SimulatorConnection(
            this.localPeerDescriptor,
            remotePeerDescriptor,
            ConnectionType.SIMULATOR_SERVER,
            this.simulator
        )

        const pendingConnection = new PendingConnection(remotePeerDescriptor)
        const handshaker = createIncomingHandshaker(this.localPeerDescriptor, pendingConnection, connection)
        logger.trace('connected')

        handshaker.once('handshakeRequest', () => {
            logger.trace(remoteNodeId + ' incoming handshake request')

            if (this.onNewConnection(pendingConnection)) {
                logger.trace(remoteNodeId + ' calling acceptHandshake')
                acceptHandshake(handshaker, pendingConnection, connection)
            } else {
                rejectHandshake(pendingConnection, connection, handshaker, HandshakeError.DUPLICATE_CONNECTION)
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
