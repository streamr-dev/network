import { ConnectionType } from '../IConnection'

import {
    PeerDescriptor,
} from '../../proto/packages/dht/protos/DhtRpc'
import { Logger } from '@streamr/utils'
import { ManagedConnection } from '../ManagedConnection'
import { PeerIDKey } from '../../helpers/PeerID'
import { Simulator } from './Simulator'
import { SimulatorConnection } from './SimulatorConnection'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

const logger = new Logger(module)

export class SimulatorConnector {

    private connectingConnections: Map<PeerIDKey, ManagedConnection> = new Map()
    private stopped = false
    private protocolVersion: string
    private ownPeerDescriptor: PeerDescriptor
    private simulator: Simulator
    private incomingConnectionCallback: (connection: ManagedConnection) => boolean

    constructor(
        protocolVersion: string,
        ownPeerDescriptor: PeerDescriptor,
        simulator: Simulator,
        incomingConnectionCallback: (connection: ManagedConnection) => boolean
    ) {
        this.protocolVersion = protocolVersion
        this.ownPeerDescriptor = ownPeerDescriptor
        this.simulator = simulator
        this.incomingConnectionCallback = incomingConnectionCallback
    }

    public connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        logger.trace('connect() ' + this.ownPeerDescriptor.nodeName + ',' + targetPeerDescriptor.nodeName)
        const peerKey = keyFromPeerDescriptor(targetPeerDescriptor)
        const existingConnection = this.connectingConnections.get(peerKey)
        if (existingConnection) {
            return existingConnection
        }

        const connection = new SimulatorConnection(this.ownPeerDescriptor!, targetPeerDescriptor, ConnectionType.SIMULATOR_CLIENT, this.simulator)

        const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion,
            ConnectionType.SIMULATOR_CLIENT, connection, undefined)
        managedConnection.setPeerDescriptor(targetPeerDescriptor!)

        this.connectingConnections.set(peerKey, managedConnection)
        connection.once('disconnected', () => {
            this.connectingConnections.delete(peerKey)
        })
        connection.once('connected', () => {
            this.connectingConnections.delete(peerKey)
        })

        connection.connect()

        return managedConnection
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor
    }

    public handleIncomingConnection(sourceConnection: SimulatorConnection): void {
        logger.trace(' ' + this.ownPeerDescriptor.nodeName + ', ' + sourceConnection.ownPeerDescriptor.nodeName +
            ' incoming connection, stopped: ' + this.stopped)
        if (this.stopped) {
            return
        }
        const connection = new SimulatorConnection(this.ownPeerDescriptor!,
            sourceConnection.ownPeerDescriptor, ConnectionType.SIMULATOR_SERVER, this.simulator)

        const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion,
            ConnectionType.SIMULATOR_SERVER, undefined, connection)

        logger.trace('connected, objectId: ' + managedConnection.objectId)

        managedConnection.once('handshakeRequest', (_peerDescriptor: PeerDescriptor) => {
            logger.trace(' ' + this.ownPeerDescriptor.nodeName + ', ' + sourceConnection.ownPeerDescriptor.nodeName + ' incoming handshake request')
            logger.trace('incoming handshake request objectId: ' + managedConnection.objectId)

            if (this.incomingConnectionCallback(managedConnection)) {
                logger.trace(' ' + this.ownPeerDescriptor.nodeName + ', ' + sourceConnection.ownPeerDescriptor.nodeName + ' calling acceptHandshake')
                managedConnection.acceptHandshake()
            } else {
                managedConnection.rejectHandshake('Duplicate connection')
                managedConnection.destroy()
            }
        })

        this.simulator.accept(sourceConnection, connection)
    }

    public async stop(): Promise<void> {
        this.stopped = true
        const conns = Array.from(this.connectingConnections.values())
        await Promise.allSettled(conns.map((conn) =>
            conn.close('OTHER')
        ))
    }
}
