import { ConstHash } from '../../../../src/plugins/operator/ConstHash'
import range from 'lodash/range'
import random from 'lodash/random'
import { randomString } from '@streamr/utils'
import { toStreamID, toStreamPartID } from '@streamr/protocol'

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

describe(ConstHash, () => {
    it('consistent assignments regardless of node adding order', () => {
        const h1 = new ConstHash()
        const h2 = new ConstHash()
        const h3 = new ConstHash()

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
            const v1 = h1.get(streamPartId)
            const v2 = h2.get(streamPartId)
            const v3 = h3.get(streamPartId)
            expect(v1).toEqual(v2)
            expect(v1).toEqual(v3)
        }
    })

    it('partitions of same stream get spread around sufficiently', () => {
        const h = new ConstHash()
        h.add('node-1')
        h.add('node-2')
        h.add('node-3')

        const assignments = []
        for (const idx of range(100)) {
            assignments.push(h.get(toStreamPartID(toStreamID('helloworld'), idx)))
        }

        checkForConsistentSequentialAssignments(assignments)
    })

    it('streams with same partition number get spread around sufficiently', () => {
        const h = new ConstHash()
        h.add('node-1')
        h.add('node-2')
        h.add('node-3')

        const assignments = range(50).map((_idx) => {
            return h.get(toStreamPartID(toStreamID(randomString(16)), 0))
        })
        checkForConsistentSequentialAssignments(assignments)
    })

    it('consistent assignments even when adding / removing nodes in-between', () => {
        const streamParts = range(50).map(() => toStreamPartID(toStreamID(randomString(6)), random(1, 10)))

        const h1 = new ConstHash()
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

        const h2 = new ConstHash()
        h2.add('node-1')
        h2.add('node-3')
        h2.add('node-4')

        for (const sp of streamParts) {
            const h1result = h1.get(sp)
            const h2result = h2.get(sp)
            expect(h1result).toEqual(h2result)
        }
    })
})
