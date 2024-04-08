import { EventEmitter } from 'eventemitter3'
import { ITransport, TransportEvents } from '../../src/transport/ITransport'
import { Message, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'

class FakeTransport extends EventEmitter<TransportEvents> implements ITransport {

    private onSend: (msg: Message) => void
    private readonly localPeerDescriptor: PeerDescriptor

    constructor(peerDescriptor: PeerDescriptor, onSend: (msg: Message) => void) {
        super()
        this.onSend = onSend
        this.localPeerDescriptor = peerDescriptor
    }

    async send(msg: Message): Promise<void> {
        msg.sourceDescriptor = this.localPeerDescriptor
        this.onSend(msg)
    }

    // eslint-disable-next-line class-methods-use-this
    getLocalPeerDescriptor(): PeerDescriptor {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getConnections(): PeerDescriptor[] {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getConnectionCount(): number {
        return 0
    }

    // eslint-disable-next-line class-methods-use-this
    hasConnection(): boolean {
        return false
    }

    // eslint-disable-next-line class-methods-use-this
    stop(): void | Promise<void> {
    }
}

export class FakeEnvironment {

    private transports: FakeTransport[] = []

    createTransport(peerDescriptor: PeerDescriptor): ITransport {
        const transport = new FakeTransport(peerDescriptor, (msg) => {
            this.transports.forEach((t) => t.emit('message', msg))
        })
        this.transports.push(transport)
        return transport
    }
}
