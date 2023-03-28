import { ITransport, Message, PeerDescriptor } from '@streamr/dht'
import { EventEmitter } from 'eventemitter3'

export class MockTransport extends EventEmitter implements ITransport {

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
