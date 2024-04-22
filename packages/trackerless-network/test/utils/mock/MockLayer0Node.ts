import { PeerDescriptor, DataEntry, ITransport, TransportEvents } from '@streamr/dht'
import { Layer0Node } from '../../../src/logic/Layer0Node'
import { EventEmitter } from 'eventemitter3'

export class MockLayer0Node extends EventEmitter<TransportEvents> implements Layer0Node {

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
    async deleteDataFromDht(): Promise<void> {
    }

    // eslint-disable-next-line class-methods-use-this
    async storeDataToDht(): Promise<PeerDescriptor[]> {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    async send(): Promise<void> {
    }

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

    // eslint-disable-next-line class-methods-use-this
    getNeighbors(): PeerDescriptor[] {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    async waitForNetworkConnectivity(): Promise<void> {
    }

    // eslint-disable-next-line class-methods-use-this
    getTransport(): ITransport {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
    }
}
