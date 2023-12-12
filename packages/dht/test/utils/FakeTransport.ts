import { EventEmitter } from 'eventemitter3'
import { ITransport, TransportEvents } from '../../src/transport/ITransport'
import { Message, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'

class FakeTransport extends EventEmitter<TransportEvents> implements ITransport {

    private onSend: (msg: Message) => void

    constructor(onSend: (msg: Message) => void) {
        super()
        this.onSend = onSend
    }

    async send(msg: Message): Promise<void> {
        this.onSend(msg)
    }

    // eslint-disable-next-line class-methods-use-this
    getLocalPeerDescriptor(): PeerDescriptor {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getAllConnectionPeerDescriptors(): PeerDescriptor[] {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    stop(): void | Promise<void> {
    }
}

export class FakeEnvironment {

    private transports: FakeTransport[] = []

    createTransport(): ITransport {
        const transport = new FakeTransport((msg) => {
            this.transports.forEach((t) => t.emit('message', msg))
        })
        this.transports.push(transport)
        return transport
    }
}
