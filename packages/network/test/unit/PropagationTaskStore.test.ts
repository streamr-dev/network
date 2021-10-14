import {
    PropagationTaskStore,
    PropagationTask
} from '../../src/logic/node/propagation/PropagationTaskStore'
import { MessageIDStrict, StreamMessage } from 'streamr-client-protocol'
import { NodeId } from '../../src/logic/node/Node'
import { StreamIdAndPartition } from '../../src/identifiers'
import { wait } from 'streamr-test-utils'

function makeTask(streamId: string, partition: number, ts: number, neighbors: string[]): PropagationTask {
    // Contents (apart from messageId) not so important here, but generate some for variety
    return {
        message: new StreamMessage({
            messageId: new MessageIDStrict(streamId, partition, ts, 0, '', ''),
            content: {
                message: `${streamId}-${partition}-${ts}`
            }
        }),
        source: null,
        handledNeighbors: new Set<NodeId>(neighbors)
    }
}

const TASKS = [
    makeTask('s1', 0, 1000, []),
    makeTask('s1', 0, 2000, ['a', 'b', 'c']),
    makeTask('s1', 1, 3000, []),
    makeTask('s2', 0, 4000, ['x', 'y']),
    makeTask('s3', 0, 5000, []),

    makeTask('s1', 0, 6000, []),
    makeTask('s1', 1, 7000, ['a', 'f']),
    makeTask('s4', 0, 8000, ['g']),
    makeTask('s5', 0, 9000, []),
    makeTask('s2', 0, 10000, ['1', '2']),
]

describe(PropagationTaskStore, () => {
    let store: PropagationTaskStore

    beforeEach(() => {
        store = new PropagationTaskStore(1000, 5)
        store.add(TASKS[0])
        store.add(TASKS[1])
        store.add(TASKS[2])
        store.add(TASKS[3])
        store.add(TASKS[4])
    })

    it('get tasks by streamId', () => {
        expect(store.get(new StreamIdAndPartition('s1', 0))).toEqual([TASKS[0], TASKS[1]])
        expect(store.get(new StreamIdAndPartition('s1', 1))).toEqual([TASKS[2]])
        expect(store.get(new StreamIdAndPartition('s2', 0))).toEqual([TASKS[3]])
        expect(store.get(new StreamIdAndPartition('s3', 0))).toEqual([TASKS[4]])
        expect(store.get(new StreamIdAndPartition('non-existing', 0))).toEqual([])
    })

    it('fifo dropping when full', () => {
        store.add(TASKS[5])
        store.add(TASKS[6])

        expect(store.get(new StreamIdAndPartition('s1', 0))).toEqual([TASKS[5]])
        expect(store.get(new StreamIdAndPartition('s1', 1))).toEqual([TASKS[2], TASKS[6]])
        expect(store.get(new StreamIdAndPartition('s2', 0))).toEqual([TASKS[3]])
        expect(store.get(new StreamIdAndPartition('s3', 0))).toEqual([TASKS[4]])

        store.add(TASKS[7])
        store.add(TASKS[8])

        expect(store.get(new StreamIdAndPartition('s1', 0))).toEqual([TASKS[5]])
        expect(store.get(new StreamIdAndPartition('s1', 1))).toEqual([TASKS[6]])
        expect(store.get(new StreamIdAndPartition('s2', 0))).toEqual([])
        expect(store.get(new StreamIdAndPartition('s3', 0))).toEqual([TASKS[4]])
        expect(store.get(new StreamIdAndPartition('s4', 0))).toEqual([TASKS[7]])
        expect(store.get(new StreamIdAndPartition('s5', 0))).toEqual([TASKS[8]])

        store.add(TASKS[9])

        expect(store.get(new StreamIdAndPartition('s1', 0))).toEqual([TASKS[5]])
        expect(store.get(new StreamIdAndPartition('s1', 1))).toEqual([TASKS[6]])
        expect(store.get(new StreamIdAndPartition('s2', 0))).toEqual([TASKS[9]])
        expect(store.get(new StreamIdAndPartition('s3', 0))).toEqual([])
        expect(store.get(new StreamIdAndPartition('s4', 0))).toEqual([TASKS[7]])
        expect(store.get(new StreamIdAndPartition('s5', 0))).toEqual([TASKS[8]])
    })

    it('deleting tasks', () => {
        store.delete(TASKS[3].message.messageId)
        store.delete(TASKS[0].message.messageId)

        expect(store.get(new StreamIdAndPartition('s1', 0))).toEqual([TASKS[1]])
        expect(store.get(new StreamIdAndPartition('s1', 1))).toEqual([TASKS[2]])
        expect(store.get(new StreamIdAndPartition('s2', 0))).toEqual([])
        expect(store.get(new StreamIdAndPartition('s3', 0))).toEqual([TASKS[4]])
    })

    it('stale tasks are not returned', async () => {
        const TTL = 100
        store = new PropagationTaskStore(TTL, 5)
        store.add(TASKS[0])
        store.add(TASKS[2])
        await wait(TTL / 2)
        store.add(TASKS[1])
        store.add(TASKS[3])
        store.add(TASKS[4])
        await wait((TTL / 2) + 1)
        expect(store.get(new StreamIdAndPartition('s1', 0))).toEqual([TASKS[1]])
        expect(store.get(new StreamIdAndPartition('s1', 1))).toEqual([])
        expect(store.get(new StreamIdAndPartition('s2', 0))).toEqual([TASKS[3]])
        expect(store.get(new StreamIdAndPartition('s3', 0))).toEqual([TASKS[4]])
    })
})