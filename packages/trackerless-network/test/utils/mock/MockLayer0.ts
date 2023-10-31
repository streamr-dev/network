import { PeerDescriptor, DataEntry, ITransport } from '@streamr/dht'
import { ILayer0 } from '../../../src/logic/ILayer0'
import { EventEmitter } from 'eventemitter3'

export class MockLayer0 extends EventEmitter implements ILayer0 {

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

    getPeerDescriptor(): PeerDescriptor {
        return this.peerDescriptor
    }

    // eslint-disable-next-line class-methods-use-this
    async getDataFromDht(): Promise<DataEntry[]> {
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
        return
    }

    // eslint-disable-next-line class-methods-use-this
    getAllConnectionPeerDescriptors(): PeerDescriptor[] {
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
