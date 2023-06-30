import { PeerID } from '../../src/helpers/PeerID'

describe('PeerID', () => {

    it('Conversions between input formats work', async () => {
        const stringId = '123'
        const id1 = PeerID.fromString(stringId)
        const id2 = PeerID.fromValue(id1.value)

        expect(id1.equals(id2)).toBeTruthy()
        expect(id1.toString()).toEqual(id2.toString())
        expect(stringId).toEqual(id2.toString())
    })

    it('peerKey', () => {
        const peerIdFromString = PeerID.fromString('asdadstqj12312f12f123')
        const peerKey = peerIdFromString.toKey()
        const peerIdFromKey = PeerID.fromKey(peerKey)
        expect(peerIdFromString.equals(peerIdFromKey)).toEqual(true)        
    })
})
