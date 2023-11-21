import { PeerDescriptor, DataEntry, ITransport, FindResult } from '@streamr/dht'
import { Layer0Node } from '../../../src/logic/Layer0Node'
import { EventEmitter } from 'eventemitter3'

export class MockLayer0Node extends EventEmitter implements Layer0Node {

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
    async startFind(): Promise<FindResult> {
        return {
            closestNodes: []
        }   
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
