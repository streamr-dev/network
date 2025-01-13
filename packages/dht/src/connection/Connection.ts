import EventEmitter from 'eventemitter3'
import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { ConnectionID, ConnectionType, ConnectionEvents } from './IConnection'
import { v4 as uuid } from 'uuid'

export class Connection extends EventEmitter<ConnectionEvents> {
    public connectionId: ConnectionID
    public connectionType: ConnectionType
    private peerDescriptor?: PeerDescriptor

    constructor(connectionType: ConnectionType) {
        super()
        this.connectionId = createRandomConnectionId()
        this.connectionType = connectionType
    }

    setPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.peerDescriptor = peerDescriptor
    }

    getPeerDescriptor(): PeerDescriptor | undefined {
        return this.peerDescriptor
    }
}

export const createRandomConnectionId = (): ConnectionID => {
    return uuid() as ConnectionID
}
