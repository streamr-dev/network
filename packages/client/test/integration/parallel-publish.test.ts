import 'reflect-metadata'
import { random, uniq } from 'lodash'
import { fastWallet } from 'streamr-test-utils'
import { wait } from '@streamr/utils'
import { StreamMessage } from 'streamr-client-protocol'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { FakeEnvironment } from './../test-utils/fake/FakeEnvironment'
import { EncryptionUtil } from './../../src/encryption/EncryptionUtil'
import { collect } from '../../src/utils/iterators'
import { addSubscriber, getGroupKeyStore } from '../test-utils/utils'

const MESSAGE_COUNT = 100

/*
 * Publishes message concurrently. Produces one message chain which contains messages in the correct order.
 */
describe('parallel publish', () => {

    const publisherWallet = fastWallet()
    const subscriberWallet = fastWallet()
    let publisher: StreamrClient
    let stream: Stream
    let receivedMessages: AsyncIterableIterator<StreamMessage<any>>

    beforeAll(async () => {
        const environment = new FakeEnvironment()
        publisher = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
        stream = await publisher.createStream('/path')
        await stream.grantPermissions({
            user: subscriberWallet.address,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        const node = environment.startNode(subscriberWallet.address)
        receivedMessages = addSubscriber(node, ...stream.getStreamParts())
    })

    it('messages in order and in same chain', async () => {
        const publishTasks = []
        for (let i = 0; i < MESSAGE_COUNT; i++) {
            const task = publisher.publish(stream.id, {
                mockId: i
            })
            publishTasks.push(task)
            if (Math.random() < 0.5) {
                await wait(random(5))
            }
        }
        await Promise.all(publishTasks)

        const sortedMessages = (await collect(receivedMessages, MESSAGE_COUNT)).sort((m1, m2) => {
            const timestampDiff = m1.getTimestamp() - m2.getTimestamp()
            return (timestampDiff !== 0) ? timestampDiff : (m1.getSequenceNumber() - m2.getSequenceNumber())
        })
        expect(uniq(sortedMessages.map((m) => m.getMsgChainId()))).toHaveLength(1)
        expect(sortedMessages[0].prevMsgRef).toBeNull()
        expect(sortedMessages.every((m, i) => {
            if (i === 0) {
                return m.prevMsgRef === null
            } else {
                const previous = sortedMessages[i - 1]
                return (m.prevMsgRef!.timestamp === previous.getTimestamp()) && (m.prevMsgRef!.sequenceNumber === previous.getSequenceNumber())
            }
        })).toBeTrue()

        const groupKeyIds = uniq(sortedMessages.map((m) => m.groupKeyId))
        expect(groupKeyIds).toHaveLength(1)

        const groupKeyPersistence = getGroupKeyStore(stream.id, await publisher.getAddress())
        const groupKey = await groupKeyPersistence.get(groupKeyIds[0]!)
        const decryptedMessages = sortedMessages.map((m) => {
            EncryptionUtil.decryptStreamMessage(m, groupKey!)
            return m
        })
        expect(decryptedMessages.every((m, i) => m.getParsedContent().mockId === i)).toBeTrue()
    })
})
