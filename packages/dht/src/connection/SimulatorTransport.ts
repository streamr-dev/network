import { Message, PeerDescriptor } from '../proto/DhtRpc'
import { EventEmitter } from 'eventemitter3'
import { ITransport, TransportEvents } from '../transport/ITransport'
import { Simulator } from './Simulator'

export class SimulatorTransport extends EventEmitter<TransportEvents> implements ITransport {

    private ownPeerDescriptor: PeerDescriptor
    private simulator: Simulator

    constructor(ownPeerDescriptor: PeerDescriptor, simulator: Simulator) {
        super()
        this.ownPeerDescriptor = ownPeerDescriptor
        this.simulator = simulator
        this.simulator.addConnectionManager(this)
    }

    send(msg: Message, peerDescriptor: PeerDescriptor): void {
        this.simulator.send(this.ownPeerDescriptor, peerDescriptor, msg)
    }

    // eslint-disable-next-line class-methods-use-this
    disconnect(_peerDescriptor: PeerDescriptor): void { }

    getPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor
    }

    handleIncomingMessage(peerDescriptor: PeerDescriptor, msg: Message): void {
        this.emit('data', msg, peerDescriptor)
    }
}
