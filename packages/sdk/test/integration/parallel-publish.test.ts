import 'reflect-metadata'

import { wait } from '@streamr/utils'
import random from 'lodash/random'
import uniq from 'lodash/uniq'
import { fastWallet } from '@streamr/test-utils'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { FakeEnvironment } from './../test-utils/fake/FakeEnvironment'

const MESSAGE_COUNT = 100

/*
 * Publishes message concurrently. Produces one message chain which contains messages in the correct order.
 */
describe('parallel publish', () => {
    const publisherWallet = fastWallet()
    let publisher: StreamrClient
    let stream: Stream
    let environment: FakeEnvironment

    beforeAll(async () => {
        environment = new FakeEnvironment()
        publisher = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
        stream = await publisher.createStream('/path')
    })

    afterAll(async () => {
        await environment.destroy()
    })

    it('messages in order and in same chain', async () => {
        const publishTasks = []
        for (let i = 0; i < MESSAGE_COUNT; i++) {
            const task = await publisher.publish(stream.id, {
                mockId: i
            })
            publishTasks.push(task)
            if (Math.random() < 0.5) {
                await wait(random(5))
            }
        }
        await Promise.all(publishTasks)

        const sentMessages = await environment.getNetwork().waitForSentMessages({
            count: MESSAGE_COUNT
        })

        const sortedMessages = sentMessages.sort((m1, m2) => {
            const timestampDiff = m1.getTimestamp() - m2.getTimestamp()
            return timestampDiff !== 0 ? timestampDiff : m1.getSequenceNumber() - m2.getSequenceNumber()
        })
        expect(uniq(sortedMessages.map((m) => m.getMsgChainId()))).toHaveLength(1)
        expect(sortedMessages[0].prevMsgRef).toBeUndefined()
        expect(
            sortedMessages.every((m, i) => {
                if (i === 0) {
                    return m.prevMsgRef === undefined
                } else {
                    const previous = sortedMessages[i - 1]
                    return (
                        m.prevMsgRef!.timestamp === previous.getTimestamp() &&
                        m.prevMsgRef!.sequenceNumber === previous.getSequenceNumber()
                    )
                }
            })
        ).toBeTrue()

        const groupKeyIds = uniq(sortedMessages.map((m) => m.groupKeyId))
        expect(groupKeyIds).toHaveLength(1)
    })
})
