import { MessageID, OrderingUtil, toStreamID } from '../../../src'
import shuffle from 'array-shuffle'
import StreamMessage from '../../../src/protocol/message_layer/StreamMessage'
import MessageRef from '../../../src/protocol/message_layer/MessageRef'
import { wait, waitForCondition } from 'streamr-test-utils'

const MESSAGES_PER_PUBLISHER = 1000
const MAX_MESSAGE_ARRIVAL_LATENCY = 20
const MESSAGE_FAILURE_RATE = 1/10
const NON_EXISTING_MESSAGE_RATE = 1/100
const LAST_MESSAGE_TIMESTAMP = MESSAGES_PER_PUBLISHER

const PUBLISHER_IDS = ['publisherOne', 'publisherTwo', 'publisherThree']

function createMsg(timestamp: number, prevTimestamp: number | null, publisherId: string): StreamMessage {
    const messageId = new MessageID(toStreamID('streamId'), 0, timestamp, 0, publisherId, '')
    const prevMsgRef = prevTimestamp ? new MessageRef(prevTimestamp, 0) : null
    return new StreamMessage({
        messageId,
        prevMsgRef,
        content: {},
    })
}

function formChainOfMessages(publisherId: string): Array<StreamMessage> {
    const chainOfMessages = [createMsg(1, null, publisherId)]
    for (let i = 2; i <= MESSAGES_PER_PUBLISHER; i++) {
        chainOfMessages.push(createMsg(i, i - 1, publisherId))
    }
    return chainOfMessages
}

function timestampsFrom(recordedMessages: Record<string, StreamMessage[]>): Record<string, number[]> {
    return Object.assign([...Object.entries(recordedMessages).map(([publisherId, messages]) => {
        return {
            [publisherId]: messages.map((m) => m.getTimestamp())
        }
    })])
}

describe(OrderingUtil, () => {
    it('handles unordered messages and gap fills (large randomized test)', async () => {
        const expected: Record<string, StreamMessage[]> = {}
        const actual: Record<string, StreamMessage[]> = {}

        for (const publisherId of PUBLISHER_IDS) {
            expected[publisherId] = formChainOfMessages(publisherId)
                .filter((m) => m.getTimestamp() === LAST_MESSAGE_TIMESTAMP || Math.random() > NON_EXISTING_MESSAGE_RATE)
            actual[publisherId] = []
        }

        const inOrderHandler = (msg: StreamMessage) => {
            actual[msg.getPublisherId()].push(msg)
        }

        const addMessageToUtil = async (msg: StreamMessage, maxLatency: number) => {
            await wait(Math.random() * maxLatency)
            util.add(msg)
        }

        const gapHandler = async (from: MessageRef, to: MessageRef, publisherId: string) => {
            const requestedMessages = expected[publisherId].filter((msg) => {
                return msg.getTimestamp() > from.timestamp && msg.getTimestamp() <= to.timestamp
            })
            //console.log('publisher=%s, from=(%d, %d), to=(%d, %d), vastaus=%j', publisherId, from.timestamp, from.sequenceNumber, to.timestamp, to.sequenceNumber, requestedMessages.map((m) => m.getTimestamp()))
            for (const msg of requestedMessages) {
                await addMessageToUtil(msg, MAX_MESSAGE_ARRIVAL_LATENCY)
            }
        }

        const util = new OrderingUtil(inOrderHandler, gapHandler, 50, 100, 3)

        util.on('error', (err) => {
            console.warn(err)
        })

        // supply 1st message of chain always
        for (const publisherId of PUBLISHER_IDS) {
            util.add(expected[publisherId][0])
        }

        const realTimeMessages = shuffle(Object.values(expected).flat())
            .filter((m) => m.getTimestamp() === LAST_MESSAGE_TIMESTAMP || Math.random() > MESSAGE_FAILURE_RATE)
        for (const msg of realTimeMessages) {
            await addMessageToUtil(msg, MAX_MESSAGE_ARRIVAL_LATENCY)
        }

        await Promise.race([
            waitForCondition(() => PUBLISHER_IDS.every((publisherId) => expected[publisherId].length === actual[publisherId].length), 30*1000),
            wait(29 * 1000)
        ])
        expect(timestampsFrom(expected)).toStrictEqual(timestampsFrom(actual))
    }, 60 * 1000)
})
