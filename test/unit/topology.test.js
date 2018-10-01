const { getPeersTopology } = require('../../src/helpers/TopologyStrategy')
const { getPeers } = require('../util')

describe('check TopologyStrategy', () => {
    it('check empty result', (done) => {
        expect(getPeersTopology([], '')).toEqual([])

        done()
    })

    it('if ask less than we have, return all peers', (done) => {
        const peers = getPeers(3)
        expect(getPeersTopology(peers, '')).toEqual(peers)

        done()
    })

    it('if in array only the same address, receive nothing', (done) => {
        const peers = getPeers(1)
        expect(getPeersTopology(peers, 'address-0')).toEqual([])

        done()
    })

    it('if in array three addresses, receive two', (done) => {
        const peers = getPeers(3)
        const result = getPeersTopology(peers, 'address-1')

        expect(result).toEqual(['address-0', 'address-2'])
        expect(result.length).toEqual(2)

        done()
    })

    it('if in array more than asked, receive random set of addresses', (done) => {
        const peers = getPeers(100)
        const address = 'address-1'
        const result = getPeersTopology(peers, address)

        expect(result.length).toEqual(10)
        expect(result.indexOf(address)).toEqual(-1)

        // check that we don't have duplicates
        expect([...new Set(result)]).toEqual(result)

        done()
    })
})
