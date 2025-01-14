import 'reflect-metadata'

import { StreamID, toStreamID, toStreamPartID, utf8ToBinary, wait } from '@streamr/utils'
import range from 'lodash/range'
import shuffle from 'lodash/shuffle'
import { MessageSigner } from '../../src/signature/MessageSigner'
import { MessageStream } from '../../src/subscribe/MessageStream'
import { waitForAssignmentsToPropagate } from '../../src/utils/waitForAssignmentsToPropagate'
import { createRandomAuthentication, mockLoggerFactory } from '../test-utils/utils'
import { MessageID } from './../../src/protocol/MessageID'
import {
    ContentType,
    EncryptionType,
    SignatureType,
    StreamMessage,
    StreamMessageType
} from './../../src/protocol/StreamMessage'

const authentication = createRandomAuthentication()
const messageSigner = new MessageSigner(authentication)

async function makeMsg(ts: number, content: unknown): Promise<StreamMessage> {
    return messageSigner.createSignedMessage(
        {
            messageId: new MessageID(
                toStreamID('assignmentStreamId'),
                0,
                ts,
                0,
                await authentication.getUserId(),
                'msgChain'
            ),
            messageType: StreamMessageType.MESSAGE,
            content: utf8ToBinary(JSON.stringify(content)),
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.NONE
        },
        SignatureType.SECP256K1
    )
}

async function createAssignmentMessagesFor(stream: { id: StreamID; partitions: number }): Promise<StreamMessage[]> {
    return Promise.all(
        range(0, stream.partitions).map((partition) =>
            makeMsg(partition * 1000, {
                streamPart: toStreamPartID(stream.id, partition)
            })
        )
    )
}

const RACE_TIMEOUT_IN_MS = 20

const TARGET_STREAM = Object.freeze({
    id: toStreamID('test.eth/foo/bar'),
    partitions: 5
})

describe(waitForAssignmentsToPropagate, () => {
    let messageStream: MessageStream
    let propagatePromiseState: 'rejected' | 'resolved' | 'pending'
    let propagatePromise: Promise<any>

    beforeEach(() => {
        messageStream = new MessageStream()
        propagatePromiseState = 'pending'
        propagatePromise = waitForAssignmentsToPropagate(messageStream, TARGET_STREAM, mockLoggerFactory())
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
            await messageStream.push(
                await makeMsg(1000, {
                    something: 'unexpected'
                })
            )
            await messageStream.push(await makeMsg(1200, {}))
            await Promise.race([propagatePromise, wait(RACE_TIMEOUT_IN_MS)])
            expect(propagatePromiseState).toEqual('pending') // would be rejected if error instead of ignore
        })

        it('assignments of other streams are ignored', async () => {
            const otherStream = {
                id: toStreamID('test.eth/other/stream'),
                partitions: TARGET_STREAM.partitions
            }
            for (const message of await createAssignmentMessagesFor(otherStream)) {
                await messageStream.push(message)
            }
            await Promise.race([propagatePromise, wait(RACE_TIMEOUT_IN_MS)])
            expect(propagatePromiseState).toEqual('pending') // would be resolved if counted towards valid
        })

        it('duplicate assignments are ignored', async () => {
            const messagesButMissingOne = (await createAssignmentMessagesFor(TARGET_STREAM)).slice(0, -1)
            for (const message of messagesButMissingOne) {
                await messageStream.push(message)
            }
            for (const message of messagesButMissingOne) {
                await messageStream.push(message)
            }
            await Promise.race([propagatePromise, wait(RACE_TIMEOUT_IN_MS)])
            expect(propagatePromiseState).toEqual('pending') // would be resolved if counted towards valid
        })

        it('non-existing partition assignments are ignored', async () => {
            const messagesButMissingOne = (await createAssignmentMessagesFor(TARGET_STREAM)).slice(0, -1)
            for (const message of messagesButMissingOne) {
                await messageStream.push(message)
            }
            await messageStream.push(
                await makeMsg(8000, {
                    streamPart: toStreamPartID(TARGET_STREAM.id, TARGET_STREAM.partitions)
                })
            )
            await messageStream.push(
                await makeMsg(9000, {
                    streamPart: toStreamPartID(TARGET_STREAM.id, TARGET_STREAM.partitions + 1)
                })
            )
            await Promise.race([propagatePromise, wait(RACE_TIMEOUT_IN_MS)])
            expect(propagatePromiseState).toEqual('pending') // would be resolved if counted towards valid
        })
    })

    it('resolves if all assignments received one-by-one', async () => {
        for (const message of await createAssignmentMessagesFor(TARGET_STREAM)) {
            expect(propagatePromiseState).toEqual('pending')
            await messageStream.push(message)
        }
        await Promise.race([propagatePromise, wait(RACE_TIMEOUT_IN_MS)])
        expect(propagatePromiseState).toEqual('resolved')
    })

    it('resolves if all assignments received, out-of-order with ignored cases between', async () => {
        const assignments = await createAssignmentMessagesFor({ ...TARGET_STREAM, partitions: 8 })
        const validAssignments = assignments.slice(0, 5)
        const invalidPartitionAssignments = assignments.slice(5, 8)
        const duplicateAssignments = assignments.slice(1, 3)
        const otherStreamAssignments = await createAssignmentMessagesFor({
            id: toStreamID('test.eth/other/stream'),
            partitions: TARGET_STREAM.partitions
        })
        const invalidMessages = [
            await makeMsg(1000, {
                something: 'unexpected'
            }),
            await makeMsg(1200, {})
        ]

        const messagesToPush = shuffle([
            ...validAssignments,
            ...invalidPartitionAssignments,
            ...duplicateAssignments,
            ...otherStreamAssignments,
            ...invalidMessages
        ])

        for (const message of messagesToPush) {
            await messageStream.push(message)
        }
        await Promise.race([propagatePromise, wait(RACE_TIMEOUT_IN_MS)])
        expect(propagatePromiseState).toEqual('resolved')
    })
})
