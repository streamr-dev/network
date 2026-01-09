import range from 'lodash/range'
import sampleSize from 'lodash/sampleSize'
import sortBy from 'lodash/sortBy'
import { getPeerDistance } from '../../src/dht/helpers/getPeerDistance'
import { getClosestNodes } from '../../src/dht/contact/getClosestNodes'
import { DhtAddress, randomDhtAddress, toNodeId, toDhtAddressRaw } from '../../src/identifiers'
import { createMockPeerDescriptor } from '../utils/utils'
import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'

describe('getClosestNodes', () => {

    it('happy path', () => {
        const peerDescriptors = range(10).map(() => createMockPeerDescriptor())
        const referenceId = randomDhtAddress()
        const excluded = new Set<DhtAddress>(sampleSize(peerDescriptors.map((n) => toNodeId(n)), 2))

        const actual = getClosestNodes(
            referenceId,
            peerDescriptors,
            {
                maxCount: 5,
                excludedNodeIds: excluded
            }
        )

        const expected = sortBy(
            peerDescriptors.filter((n) => !excluded.has(toNodeId(n))),
            (peerDescriptor: PeerDescriptor) => getPeerDistance(peerDescriptor.nodeId, toDhtAddressRaw(referenceId))
        ).slice(0, 5)
        expect(actual).toEqual(expected)
    })
})
