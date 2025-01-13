import { ITransport, PeerDescriptor, TransportEvents } from '@streamr/dht'
import { EventEmitter } from 'eventemitter3'

export class MockTransport extends EventEmitter<TransportEvents> implements ITransport {
    // eslint-disable-next-line class-methods-use-this
    async send(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    getLocalPeerDescriptor(): PeerDescriptor {
        return PeerDescriptor.create()
    }

    // eslint-disable-next-line class-methods-use-this
    stop(): void {}

    // eslint-disable-next-line class-methods-use-this
    getDiagnosticInfo(): Record<string, unknown> {
        return {}
    }

    // eslint-disable-next-line class-methods-use-this
    enablePrivateClientMode(): void {}
}
