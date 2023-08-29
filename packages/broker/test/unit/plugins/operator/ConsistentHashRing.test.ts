import { ConsistentHashRing } from '../../../../src/plugins/operator/ConsistentHashRing'
import range from 'lodash/range'
import random from 'lodash/random'
import { randomString } from '@streamr/utils'
import { toStreamID, toStreamPartID } from '@streamr/protocol'

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

        h1.add('node-1')
        h1.add('node-2')
        h1.add('node-3')

        h2.add('node-2')
        h2.add('node-1')
        h2.add('node-3')

        h3.add('node-3')
        h3.add('node-2')
        h3.add('node-1')

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
        h.add('node-1')
        h.add('node-2')
        h.add('node-3')

        const assignments = []
        for (const idx of range(100)) {
            assignments.push(h.get(toStreamPartID(toStreamID('helloworld'), idx))[0])
        }

        checkForConsistentSequentialAssignments(assignments)
    })

    it('streams with same partition number get spread around sufficiently', () => {
        const h = new ConsistentHashRing(1)
        h.add('node-1')
        h.add('node-2')
        h.add('node-3')

        const assignments = range(50).map((_idx) => {
            return h.get(toStreamPartID(toStreamID(randomString(16)), 0))[0]
        })
        checkForConsistentSequentialAssignments(assignments)
    })

    it('consistent assignments even when adding / removing nodes in-between', () => {
        const streamParts = range(50).map(() => toStreamPartID(toStreamID(randomString(6)), random(1, 10)))

        const h1 = new ConsistentHashRing(1)
        h1.add('node-1')
        h1.add('node-2')
        streamParts.forEach((sp) => h1.get(sp))
        h1.remove('node-2')
        h1.add('node-3')
        streamParts.forEach((sp) => h1.get(sp))
        h1.remove('node-1')
        streamParts.forEach((sp) => h1.get(sp))
        h1.add('node-1')
        h1.add('node-4')
        streamParts.forEach((sp) => h1.get(sp))
        h1.remove('node-4')
        h1.add('node-4')
        streamParts.forEach((sp) => h1.get(sp))
        streamParts.forEach((sp) => h1.get(sp))

        const h2 = new ConsistentHashRing(1)
        h2.add('node-1')
        h2.add('node-3')
        h2.add('node-4')

        for (const sp of streamParts) {
            const h1result = h1.get(sp)
            const h2result = h2.get(sp)
            expect(h1result).toEqual(h2result)
        }
    })

    it('redundancy factor > 1', () => {
        const h = new ConsistentHashRing(3)
        h.add('node-1')
        h.add('node-2')
        h.add('node-3')

        const assignments = h.get(toStreamPartID(toStreamID('foo'), 0))
        expect(assignments).toIncludeSameMembers(['node-1', 'node-2', 'node-3'])

        const assignments2 = h.get(toStreamPartID(toStreamID('bar'), 0))
        expect(assignments2).toIncludeSameMembers(['node-1', 'node-2', 'node-3'])

        const h2 = new ConsistentHashRing(3)
        h2.add('node-1')
        h2.add('node-2')
        h2.add('node-3')
        h2.add('node-4')
        h2.add('node-5')
        h2.add('node-6')
        h2.add('node-7')
        h2.add('node-8')
        h2.add('node-9')

        const assignments3 = h2.get(toStreamPartID(toStreamID('foo'), 0))
        expect(assignments3).toIncludeSameMembers(['node-5', 'node-6', 'node-7']) // expectation based on arbitrary hashing

        const assignments4 = h2.get(toStreamPartID(toStreamID('barbar'), 0))
        expect(assignments4).toIncludeSameMembers(['node-3', 'node-4', 'node-5']) // expectation based on arbitrary hashing
    })
})
