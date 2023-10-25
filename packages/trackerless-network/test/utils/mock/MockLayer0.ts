import { PeerDescriptor, DataEntry } from '@streamr/dht'
import { ILayer0 } from '../../../src/logic/ILayer0'
import { EventEmitter } from 'eventemitter3'

export class MockLayer0 extends EventEmitter implements ILayer0 {

    private readonly peerDescriptor: PeerDescriptor

    constructor(peerDescriptor: PeerDescriptor) {
        super()
        this.peerDescriptor = peerDescriptor
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.peerDescriptor
    }

    // eslint-disable-next-line class-methods-use-this
    async getDataFromDht(_key: Uint8Array): Promise<DataEntry[]> {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    async deleteDataFromDht(_key: Uint8Array): Promise<void> {
        
    }

    // eslint-disable-next-line class-methods-use-this
    async storeDataToDht(_key: Uint8Array): Promise<PeerDescriptor[]> {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    async send(): Promise<void> {
        return
    }

    // eslint-disable-next-line class-methods-use-this
    getKnownEntryPoints(): PeerDescriptor[] {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    getAllConnectionPeerDescriptors(): PeerDescriptor[] {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    async waitForNetworkConnectivity(): Promise<void> {
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {

    }

}
