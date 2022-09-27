import { Message, PeerDescriptor } from '../proto/DhtRpc'
import { EventEmitter } from 'eventemitter3'
import { ITransport, TransportEvents } from '../transport/ITransport'
import { Simulator } from './Simulator'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export class SimulatorTransport extends EventEmitter<TransportEvents> implements ITransport {
    constructor(private ownPeerDescriptor: PeerDescriptor, private simulator: Simulator) {
        super()
        this.simulator.addConnectionManager(this)
    }

    send(msg: Message, peerDescriptor: PeerDescriptor): void {
        this.simulator.send(this.ownPeerDescriptor, peerDescriptor, msg)
    }

    disconnect(_peerDescriptor: PeerDescriptor): void { }

    getPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor
    }

    handleIncomingMessage(peerDescriptor: PeerDescriptor, msg: Message): void {
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
