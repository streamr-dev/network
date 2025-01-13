import { ITransport, TransportEvents } from '../../../src/transport/ITransport'
import { EventEmitter } from 'eventemitter3'
import { PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'

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
}
