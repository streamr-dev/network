/* eslint-disable class-methods-use-this */

import 'setimmediate'

import { PeerID } from '../../helpers/PeerID'
import { ConnectionType } from '../IConnection'

import {
    PeerDescriptor,
} from '../../proto/packages/dht/protos/DhtRpc'
import { Logger } from '@streamr/utils'
import { ManagedConnection } from '../ManagedConnection'
import { PeerIDKey } from '../../helpers/PeerID'
import { Simulator } from './Simulator'
import { SimulatorConnection } from './SimulatorConnection'

const logger = new Logger(module)

export class SimulatorConnector {

    private connectingConnections: Map<PeerIDKey, ManagedConnection> = new Map()
    private stopped = false

    constructor(
        private protocolVersion: string,
        private ownPeerDescriptor: PeerDescriptor,
        private simulator: Simulator,
        private incomingConnectionCallback: (connection: ManagedConnection) => boolean
    ) {
    }

    public async start(): Promise<void> {
    }

    public connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        logger.trace('connect() ' + this.ownPeerDescriptor.nodeName + ',' + targetPeerDescriptor.nodeName)
        const peerKey = PeerID.fromValue(targetPeerDescriptor.kademliaId).toKey()
        const existingConnection = this.connectingConnections.get(peerKey)
        if (existingConnection) {
            return existingConnection
        }

        const connection = new SimulatorConnection(this.ownPeerDescriptor!, targetPeerDescriptor, ConnectionType.SIMULATOR_CLIENT, this.simulator)

        const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion,
            ConnectionType.SIMULATOR_CLIENT, connection, undefined)
        managedConnection.setPeerDescriptor(targetPeerDescriptor!)

        this.connectingConnections.set(PeerID.fromValue(targetPeerDescriptor.kademliaId).toKey(), managedConnection)
        connection.once('disconnected', () => {
            this.connectingConnections.delete(PeerID.fromValue(targetPeerDescriptor.kademliaId).toKey())
        })
        connection.once('connected', () => {
            this.connectingConnections.delete(PeerID.fromValue(targetPeerDescriptor.kademliaId).toKey())
        })

        connection.connect()

        return managedConnection
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor
    }

    public handleIncomingConnection(sourceConnection: SimulatorConnection): void {
        if (this.stopped) {
            return
        }
        const connection = new SimulatorConnection(this.ownPeerDescriptor!,
            sourceConnection.ownPeerDescriptor, ConnectionType.SIMULATOR_SERVER, this.simulator)

        this.simulator.accept(sourceConnection, connection)

        const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion,
            ConnectionType.SIMULATOR_SERVER, undefined, connection)

        logger.trace('connected, objectId: ' + managedConnection.objectId)

        managedConnection.once('handshakeRequest', (_peerDescriptor: PeerDescriptor) => {
            logger.trace('incoming handshake request objectId: ' + managedConnection.objectId)

            if (this.incomingConnectionCallback(managedConnection)) {
                managedConnection.acceptHandshake()
            } else {
                managedConnection.rejectHandshake('Duplicate connection')
                managedConnection.destroy()
            }
            //this.emit('newConnection', managedConnection)
        })
    }

    /*
    public handleIncomingDisconnection(source: PeerDescriptor): void {
        if (this.stopped) {
            return
        }
        const connection = this.simulatorConnections.get(PeerID.fromValue(source.peerId).toKey())
        connection?.handleIncomingDisconnection()
        this.simulatorConnections.delete(PeerID.fromValue(source.peerId).toKey())
    }

    public handleIncomingData(from: PeerDescriptor, data: Uint8Array): void {
        if (this.stopped) {
            return
        }
        const connection = this.simulatorConnections.get(PeerID.fromValue(from.peerId).toKey())
        connection?.handleIncomingData(data)
    }
    */

    public async stop(): Promise<void> {
        this.stopped = true
        const conns = Array.from(this.connectingConnections.values())
        logger.trace('CONNECTING conns.length in STOP ' + conns.length)
        await Promise.allSettled(conns.map((conn) =>
            conn.close()
        ))
        //this.removeAllListeners()
    }
}
