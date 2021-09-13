import { PeerInfo } from '../../src/connection/PeerInfo'

describe('PeerInfo', () => {
    let nodeInfo: PeerInfo
    let trackerInfo: PeerInfo
    let unknownInfo: PeerInfo

    beforeEach(() => {
        nodeInfo = PeerInfo.newNode('0x21583691f17b9e36a4577520f8db04a19a2f2a0d', 'NetworkNode')
        trackerInfo = PeerInfo.newTracker('0x4c56dbe52abb0878ee05dc15b86d660e7ef3329e')
        unknownInfo = PeerInfo.newUnknown('0xeba1386b00de68dcc514ac5d7de7fcb48495c4c7')
    })

    it('isNode', () => {
        expect(nodeInfo.isNode()).toEqual(true)
        expect(trackerInfo.isNode()).toEqual(false)
        expect(unknownInfo.isNode()).toEqual(false)
    })

    it('isTracker', () => {
        expect(nodeInfo.isTracker()).toEqual(false)
        expect(trackerInfo.isTracker()).toEqual(true)
        expect(unknownInfo.isTracker()).toEqual(false)
    })

    it('toString', () => {
        expect(nodeInfo.toString()).toEqual('NetworkNode<0x215836>')
        expect(trackerInfo.toString()).toEqual('<0x4c56db>')
        expect(unknownInfo.toString()).toEqual('<0xeba138>')
    })

    it('PeerInfo constructor throws if invalid peerType', () => {
        expect(() => new PeerInfo('peerId', 'invalidPeerType' as any, [2], [32])).toThrow()
    })

    it('fromObject', () => {
        const peerInfo = PeerInfo.fromObject({
            peerId: 'peerId',
            peerType: 'tracker',
            controlLayerVersions: [2],
            messageLayerVersions: [32]
        })
        expect(peerInfo.peerId).toEqual('peerId')
        expect(peerInfo.isTracker()).toEqual(true)
    })

    it('id is null if not given', () => {
        const peerInfo = PeerInfo.newNode('nodeId')
        expect(peerInfo.peerName).toEqual(null)
    })

    it('use default location if not given', () => {
        const peerInfo = PeerInfo.newNode('nodeId', 'nodeName',undefined , undefined, null)
        expect(peerInfo.location).toEqual({
            city: null,
            country: null,
            latitude: null,
            longitude: null
        })
    })
})
