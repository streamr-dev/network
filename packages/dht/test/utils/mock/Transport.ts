import { ITransport, TransportEvents } from '../../../src/transport/ITransport'
import { EventEmitter } from 'eventemitter3'
import { Message, PeerDescriptor } from '../../../src/proto/packages/dht/protos/DhtRpc'

export class MockTransport extends EventEmitter<TransportEvents> implements ITransport {

    // eslint-disable-next-line class-methods-use-this
    async send(_msg: Message, _doNotConnect?: boolean): Promise<void> {

    }

    // eslint-disable-next-line class-methods-use-this
    getPeerDescriptor(): PeerDescriptor {
        return PeerDescriptor.create()
    }

    // eslint-disable-next-line class-methods-use-this
    getAllConnectionPeerDescriptors(): PeerDescriptor[] {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    stop(): void {

    }
}
