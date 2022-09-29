import { Message, PeerDescriptor } from '../proto/DhtRpc'
import { EventEmitter } from 'eventemitter3'
import { ITransport, TransportEvents } from '../transport/ITransport'
import { Simulator } from './Simulator'
import { Logger } from '@streamr/utils'
import { PeerID, PeerIDKey } from '../helpers/PeerID'

const logger = new Logger(module)

export class SimulatorTransport extends EventEmitter<TransportEvents> implements ITransport {

    private peers: Set<PeerIDKey> = new Set()

    constructor(private ownPeerDescriptor: PeerDescriptor, private simulator: Simulator) {
        super()
        this.simulator.addConnectionManager(this)
    }

    send(msg: Message, peerDescriptor: PeerDescriptor): void {
        if (!this.peers.has(PeerID.fromValue(peerDescriptor.peerId).toKey())) {
            this.peers.add(PeerID.fromValue(peerDescriptor.peerId).toKey())
            this.emit('connected', peerDescriptor)
        }
        this.simulator.send(this.ownPeerDescriptor, peerDescriptor, msg)
    }

    disconnect(peerDescriptor: PeerDescriptor): void {
        if (this.peers.has(PeerID.fromValue(peerDescriptor.peerId).toKey())) {
            this.peers.delete(PeerID.fromValue(peerDescriptor.peerId).toKey())
            this.emit('disconnected', peerDescriptor)
        }
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor
    }

    handleIncomingMessage(peerDescriptor: PeerDescriptor, msg: Message): void {
        if (!this.peers.has(PeerID.fromValue(peerDescriptor.peerId).toKey())) {
            this.peers.add(PeerID.fromValue(peerDescriptor.peerId).toKey())
            this.emit('connected', peerDescriptor)
        }
        this.emit('data', msg, peerDescriptor)
    }

    public handleIncomingData(data: Uint8Array, peerDescriptor: PeerDescriptor): void {
        try {
            const message = Message.fromBinary(data)
            logger.trace('Received message of type ' + message.messageType)
            this.emit('data', message, peerDescriptor)
        } catch (e) {
            logger.error('Parsing "Message" from protobuf failed')
        }
    }
}
