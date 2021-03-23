import { PeerInfo } from '../../src/connection/PeerInfo'

describe('PeerInfo', () => {
    let nodeInfo: PeerInfo
    let storageInfo: PeerInfo
    let trackerInfo: PeerInfo
    let unknownInfo: PeerInfo

    beforeEach(() => {
        nodeInfo = PeerInfo.newNode('0x21583691f17b9e36a4577520f8db04a19a2f2a0d', 'NetworkNode')
        storageInfo = PeerInfo.newStorage('0xc72e234c716445b1b54f225ec1b13e082d88d74d', 'StorageNode')
        trackerInfo = PeerInfo.newTracker('0x4c56dbe52abb0878ee05dc15b86d660e7ef3329e')
        unknownInfo = PeerInfo.newUnknown('0xeba1386b00de68dcc514ac5d7de7fcb48495c4c7')
    })

    it('isNode', () => {
        expect(nodeInfo.isNode()).toEqual(true)
        expect(storageInfo.isNode()).toEqual(true)
        expect(trackerInfo.isNode()).toEqual(false)
        expect(unknownInfo.isNode()).toEqual(false)
    })

    it('isStorage', () => {
        expect(nodeInfo.isStorage()).toEqual(false)
        expect(storageInfo.isStorage()).toEqual(true)
        expect(trackerInfo.isStorage()).toEqual(false)
        expect(unknownInfo.isStorage()).toEqual(false)
    })

    it('isTracker', () => {
        expect(nodeInfo.isTracker()).toEqual(false)
        expect(storageInfo.isTracker()).toEqual(false)
        expect(trackerInfo.isTracker()).toEqual(true)
        expect(unknownInfo.isTracker()).toEqual(false)
    })

    it('toString', () => {
        expect(nodeInfo.toString()).toEqual('NetworkNode<0x215836>')
        expect(storageInfo.toString()).toEqual('StorageNode<0xc72e23>')
        expect(trackerInfo.toString()).toEqual('<0x4c56db>')
        expect(unknownInfo.toString()).toEqual('<0xeba138>')
    })

    it('PeerInfo constructor throws if invalid peerType', () => {
        expect(() => new PeerInfo('peerId', 'invalidPeerType' as any)).toThrow()
    })

    it('fromObject', () => {
        const peerInfo = PeerInfo.fromObject({
            peerId: 'peerId',
            peerType: 'tracker'
        })
        expect(peerInfo.peerId).toEqual('peerId')
        expect(peerInfo.isTracker()).toEqual(true)
    })

    it('id is null if not given', () => {
        const peerInfo = PeerInfo.newNode('nodeId')
        expect(peerInfo.peerName).toEqual(null)
    })

    it('use default location if not given', () => {
        const peerInfo = PeerInfo.newNode('nodeId', 'nodeName', null)
        expect(peerInfo.location).toEqual({
            city: null,
            country: null,
            latitude: null,
            longitude: null
        })
    })
})
