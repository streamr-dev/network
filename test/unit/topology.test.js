const assert = require('assert')
const { getPeersTopology } = require('../../src/helpers/TopologyStrategy')
const { getPeers } = require('../util')

describe('check TopologyStrategy', () => {
    it('check empty result', (done) => {
        assert.deepEqual(getPeersTopology([], ''), [])

        done()
    })

    it('if ask less than we have, return all peers', (done) => {
        const peers = getPeers(3)
        assert.deepEqual(getPeersTopology(peers, ''), peers)

        done()
    })

    it('if in array only the same address, receive nothing', (done) => {
        const peers = getPeers(1)
        assert.deepEqual(getPeersTopology(peers, 'address-0'), [])

        done()
    })

    it('if in array three addresses, receive two', (done) => {
        const peers = getPeers(3)
        const result = getPeersTopology(peers, 'address-1')
        assert.deepEqual(result, ['address-0', 'address-2'])
        assert.equal(result.length, 2)

        done()
    })

    it('if in array more than asked, receive random set of addresses', (done) => {
        const peers = getPeers(100)
        const address = 'address-1'
        const result = getPeersTopology(peers, address)

        assert.equal(result.length, 10)
        assert.equal(result.indexOf(address), -1)

        // check that we don't have duplicates
        assert.deepEqual([...new Set(result)], result)

        done()
    })
})
