/* eslint-disable class-methods-use-this */

import 'setimmediate'
import EventEmitter from 'eventemitter3'
import {
    ManagedConnectionSourceEvent
} from './IManagedConnectionSource'

import { PeerID } from '../helpers/PeerID'
import { ConnectionType } from './IConnection'

import {
    PeerDescriptor,
} from '../proto/DhtRpc'
import { Logger } from '@streamr/utils'
import { ManagedConnection } from './ManagedConnection'
import { PeerIDKey } from '../helpers/PeerID'
import { Simulator } from './Simulator'
import { SimulatorConnection } from './SimulatorConnection'

const logger = new Logger(module)

export class SimulatorConnector extends EventEmitter<ManagedConnectionSourceEvent> {
   
    private simulatorConnections: Map<PeerIDKey, SimulatorConnection> = new Map()

    constructor(
        private protocolVersion: string,
        private ownPeerDescriptor: PeerDescriptor,
        private simulator: Simulator,
    ) {
        super()
    }

    public async start(): Promise<void> {
    }

    public connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        const connection = new SimulatorConnection(this.ownPeerDescriptor!, targetPeerDescriptor, this.simulator)
        this.simulatorConnections.set(PeerID.fromValue(targetPeerDescriptor.peerId).toKey(), connection)

        const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion,
            ConnectionType.SIMULATOR_CLIENT, connection, undefined)
        managedConnection.setPeerDescriptor(targetPeerDescriptor!)

        connection.connect()

        return managedConnection
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor
    }

    public handleIncomingConnection(source: PeerDescriptor): void {
        const connection = new SimulatorConnection(this.ownPeerDescriptor!, source, this.simulator)
        this.simulatorConnections.set(PeerID.fromValue(source.peerId).toKey(), connection)

        const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion,
            ConnectionType.SIMULATOR_SERVER, undefined, connection)
        logger.trace('connected, objectId: ' + managedConnection.objectId)
        managedConnection.once('handshakeCompleted', (_peerDescriptor: PeerDescriptor) => {
            logger.trace('handshake completed objectId: ' + managedConnection.objectId)
            this.emit('newConnection', managedConnection)
        })
    }

    public handleIncomingDisconnection(source: PeerDescriptor): void {
        const connection = this.simulatorConnections.get(PeerID.fromValue(source.peerId).toKey())
        connection!.handleIncomingDisconnection()
        this.simulatorConnections.delete(PeerID.fromValue(source.peerId).toKey())
    }

    public handleIncomingData(from: PeerDescriptor, data: Uint8Array): void {
        const connection = this.simulatorConnections.get(PeerID.fromValue(from.peerId).toKey())
        connection!.handleIncomingData(data)
    }

    public async stop(): Promise<void> {
    }
}
