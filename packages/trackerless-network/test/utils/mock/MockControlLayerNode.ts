import { PeerDescriptor, DataEntry, ITransport, TransportEvents, ConnectionsView } from '@streamr/dht'
import { ControlLayerNode } from '../../../src/logic/ControlLayerNode'
import { EventEmitter } from 'eventemitter3'
import { MockConnectionsView } from './MockConnectionsView'

export class MockControlLayerNode extends EventEmitter<TransportEvents> implements ControlLayerNode {
    private readonly peerDescriptor: PeerDescriptor

    constructor(peerDescriptor: PeerDescriptor) {
        super()
        this.peerDescriptor = peerDescriptor
    }

    // eslint-disable-next-line class-methods-use-this
    joinDht(): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    hasJoined(): boolean {
        throw new Error('not implemented')
    }

    getLocalPeerDescriptor(): PeerDescriptor {
        return this.peerDescriptor
    }

    // eslint-disable-next-line class-methods-use-this
    async fetchDataFromDht(): Promise<DataEntry[]> {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    async deleteDataFromDht(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    async storeDataToDht(): Promise<PeerDescriptor[]> {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    async send(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    getConnectionsView(): ConnectionsView {
        return new MockConnectionsView()
    }

    // eslint-disable-next-line class-methods-use-this
    getNeighbors(): PeerDescriptor[] {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    async waitForNetworkConnectivity(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    getTransport(): ITransport {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    getDiagnosticInfo(): Record<string, unknown> {
        return {}
    }
}
