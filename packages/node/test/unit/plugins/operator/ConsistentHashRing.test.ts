import { DhtAddress } from '@streamr/dht'
import { randomString, toStreamID, toStreamPartID } from '@streamr/utils'
import random from 'lodash/random'
import range from 'lodash/range'
import { ConsistentHashRing } from '../../../../src/plugins/operator/ConsistentHashRing'

const NODE_1 = 'node1' as DhtAddress
const NODE_2 = 'node2' as DhtAddress
const NODE_3 = 'node3' as DhtAddress
const NODE_4 = 'node4' as DhtAddress
const NODE_5 = 'node5' as DhtAddress
const NODE_6 = 'node6' as DhtAddress
const NODE_7 = 'node7' as DhtAddress
const NODE_8 = 'node8' as DhtAddress
const NODE_9 = 'node9' as DhtAddress

// caveat: statistically unlikely to get 10 consecutive assignments, but not impossible
function checkForConsistentSequentialAssignments(assignments: string[]): void {
    let count = 0
    let lastAssignment = null
    for (const assignment of assignments) {
        if (assignment === lastAssignment) {
            count += 1
            if (count >= 10) {
                throw new Error('10 consecutive assignments')
            }
        } else {
            lastAssignment = assignment
            count = 0
        }
    }
}

describe(ConsistentHashRing, () => {
    it('consistent assignments regardless of node insertion order', () => {
        const h1 = new ConsistentHashRing(1)
        const h2 = new ConsistentHashRing(1)
        const h3 = new ConsistentHashRing(1)

        h1.add(NODE_1)
        h1.add(NODE_2)
        h1.add(NODE_3)

        h2.add(NODE_2)
        h2.add(NODE_1)
        h2.add(NODE_3)

        h3.add(NODE_3)
        h3.add(NODE_2)
        h3.add(NODE_1)

        // eslint-disable-next-line no-underscore-dangle
        for (const _idx of range(50)) {
            const streamId = toStreamID(randomString(random(1, 50)))
            const streamPartId = toStreamPartID(streamId, random(0, 99))
            const assignment1 = h1.get(streamPartId)
            const assignment2 = h2.get(streamPartId)
            const assignment3 = h3.get(streamPartId)
            expect(assignment1).toEqual(assignment2)
            expect(assignment1).toEqual(assignment3)
        }
    })

    it('partitions of same stream get spread around sufficiently', () => {
        const h = new ConsistentHashRing(1)
        h.add(NODE_1)
        h.add(NODE_2)
        h.add(NODE_3)

        const assignments = []
        for (const idx of range(100)) {
            assignments.push(h.get(toStreamPartID(toStreamID('helloworld'), idx))[0])
        }

        checkForConsistentSequentialAssignments(assignments)
    })

    it('streams with same partition number get spread around sufficiently', () => {
        const h = new ConsistentHashRing(1)
        h.add(NODE_1)
        h.add(NODE_2)
        h.add(NODE_3)

        const assignments = range(50).map((_idx) => {
            return h.get(toStreamPartID(toStreamID(randomString(16)), 0))[0]
        })
        checkForConsistentSequentialAssignments(assignments)
    })

    it('consistent assignments even when adding / removing nodes in-between', () => {
        const streamParts = range(50).map(() => toStreamPartID(toStreamID(randomString(6)), random(1, 10)))

        const h1 = new ConsistentHashRing(1)
        h1.add(NODE_1)
        h1.add(NODE_2)
        streamParts.forEach((sp) => h1.get(sp))
        h1.remove(NODE_2)
        h1.add(NODE_3)
        streamParts.forEach((sp) => h1.get(sp))
        h1.remove(NODE_1)
        streamParts.forEach((sp) => h1.get(sp))
        h1.add(NODE_1)
        h1.add(NODE_4)
        streamParts.forEach((sp) => h1.get(sp))
        h1.remove(NODE_4)
        h1.add(NODE_4)
        streamParts.forEach((sp) => h1.get(sp))
        streamParts.forEach((sp) => h1.get(sp))

        const h2 = new ConsistentHashRing(1)
        h2.add(NODE_1)
        h2.add(NODE_3)
        h2.add(NODE_4)

        for (const sp of streamParts) {
            const h1result = h1.get(sp)
            const h2result = h2.get(sp)
            expect(h1result).toEqual(h2result)
        }
    })

    it('redundancy factor > 1', () => {
        const h = new ConsistentHashRing(3)
        h.add(NODE_1)
        h.add(NODE_2)
        h.add(NODE_3)

        const assignments = h.get(toStreamPartID(toStreamID('foo'), 0))
        expect(assignments).toIncludeSameMembers([NODE_1, NODE_2, NODE_3])

        const assignments2 = h.get(toStreamPartID(toStreamID('bar'), 0))
        expect(assignments2).toIncludeSameMembers([NODE_1, NODE_2, NODE_3])

        const h2 = new ConsistentHashRing(3)
        h2.add(NODE_1)
        h2.add(NODE_2)
        h2.add(NODE_3)
        h2.add(NODE_4)
        h2.add(NODE_5)
        h2.add(NODE_6)
        h2.add(NODE_7)
        h2.add(NODE_8)
        h2.add(NODE_9)

        const assignments3 = h2.get(toStreamPartID(toStreamID('foo'), 0))
        expect(assignments3).toIncludeSameMembers([NODE_5, NODE_6, NODE_7]) // expectation based on arbitrary hashing

        const assignments4 = h2.get(toStreamPartID(toStreamID('barbar'), 0))
        expect(assignments4).toIncludeSameMembers([NODE_3, NODE_4, NODE_5]) // expectation based on arbitrary hashing
    })

    it('handles properly situation where redundancy factor > number of nodes', () => {
        const h = new ConsistentHashRing(10)
        h.add(NODE_1)
        h.add(NODE_2)

        const result = h.get(toStreamPartID(toStreamID('streamId'), 0))
        expect(result).toEqual([NODE_1, NODE_2])
    })
})
