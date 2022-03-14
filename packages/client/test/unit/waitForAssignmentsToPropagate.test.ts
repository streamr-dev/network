import { waitForAssignmentsToPropagate } from '../../src/utils/waitForAssignmentsToPropagate'
import { MessageID, StreamID, StreamMessage, StreamPartID, toStreamID, toStreamPartID } from 'streamr-client-protocol'
import { PushPipeline } from '../../src/utils/Pipeline'
import { range, shuffle } from 'lodash'
import { wait } from 'streamr-test-utils'

function makeMsg<T>(ts: number, content: T): StreamMessage<T> {
    return new StreamMessage({
        messageId: new MessageID(toStreamID('assignmentStreamId'), 0, ts, 0, 'publisher', 'msgChain'),
        content
    })
}

function createAssignmentMessagesFor(stream: {
    id: StreamID,
    partitions: number
}): StreamMessage<{ streamPart: StreamPartID }>[] {
    return range(0, stream.partitions).map((partition) => (
        makeMsg(partition * 1000, {
            streamPart: toStreamPartID(stream.id, partition)
        })
    ))
}

const RACE_TIMEOUT_IN_MS = 20

const TARGET_STREAM = Object.freeze({
    id: toStreamID('test.eth/foo/bar'),
    partitions: 5
})

/* eslint-disable no-await-in-loop */
describe(waitForAssignmentsToPropagate, () => {
    let pushPipeline: PushPipeline<StreamMessage<any>>
    let propagatePromiseState: 'rejected' | 'resolved' | 'pending'
    let propagatePromise: Promise<any>

    beforeEach(() => {
        pushPipeline = new PushPipeline<StreamMessage<any>>()
        propagatePromiseState = 'pending'
        propagatePromise = waitForAssignmentsToPropagate(pushPipeline, TARGET_STREAM)
            .then((retValue) => {
                propagatePromiseState = 'resolved'
                return retValue
            })
            .catch(() => {
                propagatePromiseState = 'rejected'
            })
    })

    describe('ignore cases', () => {
        it('invalid payloads are ignored', async () => {
            await pushPipeline.push(makeMsg(1000, {
                something: 'unexpected'
            }))
            await pushPipeline.push(makeMsg(1200, {}))
            await Promise.race([propagatePromise, wait(RACE_TIMEOUT_IN_MS)])
            expect(propagatePromiseState).toEqual('pending') // would be rejected if error instead of ignore
        })

        it('assignments of other streams are ignored', async () => {
            const otherStream = {
                id: toStreamID('test.eth/other/stream'),
                partitions: TARGET_STREAM.partitions
            }
            for (const message of createAssignmentMessagesFor(otherStream)) {
                await pushPipeline.push(message)
            }
            await Promise.race([propagatePromise, wait(RACE_TIMEOUT_IN_MS)])
            expect(propagatePromiseState).toEqual('pending') // would be resolved if counted towards valid
        })

        it('duplicate assignments are ignored', async () => {
            const messagesButMissingOne = createAssignmentMessagesFor(TARGET_STREAM).slice(0, -1)
            for (const message of messagesButMissingOne) {
                await pushPipeline.push(message)
            }
            for (const message of messagesButMissingOne) {
                await pushPipeline.push(message)
            }
            await Promise.race([propagatePromise, wait(RACE_TIMEOUT_IN_MS)])
            expect(propagatePromiseState).toEqual('pending') // would be resolved if counted towards valid
        })

        it('non-existing partition assignments are ignored', async () => {
            const messagesButMissingOne = createAssignmentMessagesFor(TARGET_STREAM).slice(0, -1)
            for (const message of messagesButMissingOne) {
                await pushPipeline.push(message)
            }
            await pushPipeline.push(makeMsg(8000, {
                streamPart: toStreamPartID(TARGET_STREAM.id, TARGET_STREAM.partitions)
            }))
            await pushPipeline.push(makeMsg(9000, {
                streamPart: toStreamPartID(TARGET_STREAM.id, TARGET_STREAM.partitions + 1)
            }))
            await Promise.race([propagatePromise, wait(RACE_TIMEOUT_IN_MS)])
            expect(propagatePromiseState).toEqual('pending') // would be resolved if counted towards valid
        })
    })

    it('resolves if all assignments received one-by-one', async () => {
        for (const message of createAssignmentMessagesFor(TARGET_STREAM)) {
            expect(propagatePromiseState).toEqual('pending')
            await pushPipeline.push(message)
        }
        await Promise.race([propagatePromise, wait(RACE_TIMEOUT_IN_MS)])
        expect(propagatePromiseState).toEqual('resolved')
    })

    it('resolves if all assignments received, out-of-order with ignored cases between', async () => {
        const assignments = createAssignmentMessagesFor({ ...TARGET_STREAM, partitions: 8 })
        const validAssignments = assignments.slice(0, 5)
        const invalidPartitionAssignments = assignments.slice(5, 8)
        const duplicateAssignments = assignments.slice(1, 3)
        const otherStreamAssignments = createAssignmentMessagesFor({
            id: toStreamID('test.eth/other/stream'),
            partitions: TARGET_STREAM.partitions
        })
        const invalidMessages = [
            makeMsg(1000, {
                something: 'unexpected'
            }),
            makeMsg(1200, {})
        ]

        const messagesToPush = shuffle([
            ...validAssignments,
            ...invalidPartitionAssignments,
            ...duplicateAssignments,
            ...otherStreamAssignments,
            ...invalidMessages
        ])

        for (const message of messagesToPush) {
            await pushPipeline.push(message)
        }
        await Promise.race([propagatePromise, wait(RACE_TIMEOUT_IN_MS)])
        expect(propagatePromiseState).toEqual('resolved')
    })
})
