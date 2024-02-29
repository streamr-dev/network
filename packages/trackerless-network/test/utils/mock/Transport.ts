import { ITransport, PeerDescriptor } from '@streamr/dht'
import { EventEmitter } from 'eventemitter3'

export class MockTransport extends EventEmitter implements ITransport {

    // eslint-disable-next-line class-methods-use-this
    async send(): Promise<void> {

    }

    // eslint-disable-next-line class-methods-use-this
    getLocalPeerDescriptor(): PeerDescriptor {
        return PeerDescriptor.create()
    }

    // eslint-disable-next-line class-methods-use-this
    getConnections(): PeerDescriptor[] {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    stop(): void {

    }
}
