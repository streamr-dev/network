import { range, sampleSize, sortBy, without } from 'lodash'
import { getDistance } from '../../src/dht/PeerManager'
import { getClosestContacts } from '../../src/dht/contact/getClosestContacts'
import { DhtAddress, createRandomDhtAddress, getRawFromDhtAddress } from '../../src/identifiers'

describe('getClosestContacts', () => {

    it('happy path', () => {
        const nodeIds = range(10).map(() => createRandomDhtAddress())
        const referenceId = createRandomDhtAddress()
        const excluded = new Set<DhtAddress>(sampleSize(nodeIds, 2))

        const actual = getClosestContacts(
            referenceId,
            nodeIds.map((nodeId) => ({ getNodeId: () => nodeId })),
            {
                maxCount: 5,
                excludedNodeIds: excluded
            }
        )

        const expected = sortBy(
            without(nodeIds, ...Array.from(excluded.values())),
            (n: DhtAddress) => getDistance(getRawFromDhtAddress(n), getRawFromDhtAddress(referenceId))
        ).slice(0, 5)
        expect(actual.map((n) => n.getNodeId())).toEqual(expected)
    })
})
