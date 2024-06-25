import { PeerDescriptor } from '../../../src/proto/packages/dht/protos/DhtRpc'

export class MockConnectionsView {
    // eslint-disable-next-line class-methods-use-this
    getConnections(): PeerDescriptor[] {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    getConnectionCount(): number {
        return 0
    }

    // eslint-disable-next-line class-methods-use-this
    hasConnection(): boolean {
        return false
    }
}
