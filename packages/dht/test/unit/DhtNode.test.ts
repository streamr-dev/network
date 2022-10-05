import { Simulator } from '../../src/connection/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerID } from '../../src/helpers/PeerID'
import * as Err from '../../src/helpers/errors'
import { ConnectionManager } from '../../src/connection/ConnectionManager'

describe('DhtNode', () => {
    let node: DhtNode
    let node2: DhtNode

    const simulator = new Simulator()
    const mockDescriptor = {
        peerId: PeerID.fromString('UnitNode').value,
        type: 0
    }
    const mockDescriptor2 = {
        peerId: PeerID.fromString('mock').value,
        type: 0
    }
    const mockOpenInternetPeerDescriptor = {
        peerId: PeerID.fromString('openinternet').value,
        type: 0,
        openInternet: true
    }

    beforeEach(async () => {
        node = new DhtNode({
            peerIdString: 'UnitNode',
            transportLayer: new ConnectionManager({ ownPeerDescriptor: mockDescriptor, simulator: simulator })
        })
        await node.start()
        // @ts-expect-error private
        node.bucket!.on("added", () => { })
        // @ts-expect-error private
        node.bucket!.on("removed", () => { })
        // @ts-expect-error private
        node.bucket!.on("ping", () => { })
        // @ts-expect-error private
        node.bucket!.on("updated", () => { })
        node2 = new DhtNode({
            peerIdString: 'UnitNode',
            transportLayer: new ConnectionManager({ ownPeerDescriptor: mockDescriptor2, simulator: simulator })
        })
        await node2.start()

    })

    afterEach(async () => {
        await node.stop()
        await node2.stop()
    })

    it('Cannot be stopped before starting', async () => {
        const notStarted = new DhtNode({
            peerIdString: 'UnitNode',
            transportLayer: new ConnectionManager({ ownPeerDescriptor: mockDescriptor, simulator: simulator })
        })
        await expect(notStarted.stop())
            .rejects
            .toEqual(new Err.CouldNotStop('Cannot not stop() before start()'))
    })

    it('DhtNode getKBucketPeers', async () => {
        // @ts-expect-error private
        node.addNewContact(mockDescriptor2)
        expect(node.getKBucketPeers().length).toEqual(1)
        expect(node.getKBucketPeers()[0]).toEqual(mockDescriptor2)
    })

    it('DhtNode getOpenInternetPeerDescriptors', async () => {
        // @ts-expect-error private
        node.addNewContact(mockDescriptor2)
        // @ts-expect-error private
        node.addNewContact(mockOpenInternetPeerDescriptor)
        expect(node.getOpenInternetPeerDescriptors().length).toEqual(1)
        expect(node.getOpenInternetPeerDescriptors()[0]).toEqual(mockOpenInternetPeerDescriptor)
    })

    it('get own descriptor', async () => {
        expect(node.getPeerDescriptor()).toEqual(mockDescriptor)
    })

    it('get bucket size', async () => {
        // @ts-expect-error private
        node.addNewContact(mockDescriptor2)
        expect(node.getBucketSize()).toEqual(1)
    })
})
