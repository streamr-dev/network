import { PeerDescriptor, peerIdFromPeerDescriptor, PeerID, RecursiveFindResult, Message } from '@streamr/dht'
import { ILayer0 } from '../../../src/logic/ILayer0'
import { Any } from '../../../src/proto/google/protobuf/any'
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

    getNodeId(): PeerID {
        return peerIdFromPeerDescriptor(this.peerDescriptor)
    }

    // eslint-disable-next-line class-methods-use-this
    async getDataFromDht(_key: Uint8Array): Promise<RecursiveFindResult> {
        return {
            closestNodes: [],
            dataEntries: []
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async storeDataToDht(_key: Uint8Array, _data: Any): Promise<PeerDescriptor[]> {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    async send(_message: Message, _doNotConnect?: boolean): Promise<void> {
        return
    }

    // eslint-disable-next-line class-methods-use-this
    getAllConnectionPeerDescriptors(): PeerDescriptor[] {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    stop(): void {

    }

}
