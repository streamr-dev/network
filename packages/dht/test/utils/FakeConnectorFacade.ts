import { PendingConnection } from '../../src/connection/PendingConnection'
import { DhtAddress } from '../../src/identifiers'
import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { ITransport } from '../../src/transport/ITransport'

export class FakeConnectorFacade {
    private readonly localPeerDescriptor: PeerDescriptor
    private onNewConnection?: (connection: PendingConnection) => boolean

    constructor(localPeerDescriptor: PeerDescriptor) {
        this.localPeerDescriptor = localPeerDescriptor
    }

    // eslint-disable-next-line class-methods-use-this
    createConnection(peerDescriptor: PeerDescriptor): PendingConnection {
        return new PendingConnection(peerDescriptor)
    }

    getLocalPeerDescriptor(): PeerDescriptor | undefined {
        return this.localPeerDescriptor
    }

    callOnNewConnection(connection: PendingConnection): boolean {
        return this.onNewConnection!(connection)
    }

    async start(
        onNewConnection: (connection: PendingConnection) => boolean,
        _hasConnection: (nodeId: DhtAddress) => boolean,
        _autoCertifierTransport: ITransport
    ): Promise<void> {
        this.onNewConnection = onNewConnection
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {}
}
