import { MessageID, OrderingUtil, toStreamID } from '../../src'
import shuffle from 'array-shuffle'
import StreamMessage from '../../src/protocol/message_layer/StreamMessage'
import MessageRef from '../../src/protocol/message_layer/MessageRef'
import { wait, waitForCondition } from 'streamr-test-utils'

const MESSAGES_PER_PUBLISHER = 1000
const MAX_MESSAGE_ARRIVAL_LATENCY = 20
const MESSAGE_FAILURE_RATE = 1/10
const NON_EXISTING_MESSAGE_RATE = 1/100

const PROPAGATION_TIMEOUT = MAX_MESSAGE_ARRIVAL_LATENCY * 3
const RESEND_TIMEOUT = MAX_MESSAGE_ARRIVAL_LATENCY * 5
const MAX_GAP_REQUESTS = 3

const PUBLISHER_IDS = ['publisherOne', 'publisherTwo', 'publisherThree']

interface MessageInfo {
    publisherId: string
    timestamp: number
    missing: boolean
    initiallyMissing: boolean
}

function formChainOfMessages(publisherId: string): Array<MessageInfo> {
    const chainOfMessages: MessageInfo[] = [{
        publisherId,
        timestamp: 1,
        missing: false,
        initiallyMissing: false
    }]
    for (let i = 2; i < MESSAGES_PER_PUBLISHER; i++) {
        chainOfMessages.push({
            publisherId,
            timestamp: i,
            missing: Math.random() < NON_EXISTING_MESSAGE_RATE,
            initiallyMissing: Math.random() < MESSAGE_FAILURE_RATE
        })
    }
    chainOfMessages.push({
        publisherId,
        timestamp: MESSAGES_PER_PUBLISHER,
        missing: false,
        initiallyMissing: false
    })
    return chainOfMessages
}

function createMsg({ publisherId, timestamp }: MessageInfo): StreamMessage {
    const messageId = new MessageID(toStreamID('streamId'), 0, timestamp, 0, publisherId, '')
    const prevMsgRef = timestamp > 1 ? new MessageRef(timestamp - 1, 0) : null
    return new StreamMessage({
        messageId,
        prevMsgRef,
        content: {},
    })
}

describe(OrderingUtil, () => {
    it('randomized "realistic" scenario with randomness', async () => {
        const actual: Record<string, number[]> = {}
        const groundTruthMessages: Record<string, MessageInfo[]> = {}
        const expected: Record<string, number[]> = {}

        for (const publisherId of PUBLISHER_IDS) {
            actual[publisherId] = []
            groundTruthMessages[publisherId] = formChainOfMessages(publisherId)
            expected[publisherId] = groundTruthMessages[publisherId]
                .filter((mi) => !mi.missing)
                .map((mi) => mi.timestamp)
        }

        const inOrderHandler = (msg: StreamMessage) => {
            actual[msg.getPublisherId()].push(msg.getTimestamp())
        }

        const addMessageToUtil = async (msgInfo: MessageInfo, maxLatency: number) => {
            await wait(Math.random() * maxLatency)
            util.add(createMsg(msgInfo))
        }

        const gapHandler = async (from: MessageRef, to: MessageRef, publisherId: string) => {
            const requestedMessages = groundTruthMessages[publisherId].filter(({ missing, timestamp }) => {
                return !missing && (timestamp > from.timestamp && timestamp <= to.timestamp)
            })
            for (const msg of requestedMessages) {
                await addMessageToUtil(msg, MAX_MESSAGE_ARRIVAL_LATENCY)
            }
        }

        const util = new OrderingUtil(inOrderHandler, gapHandler, PROPAGATION_TIMEOUT, RESEND_TIMEOUT, MAX_GAP_REQUESTS)
        util.on('error', () => {})

        // supply 1st message of chain always to set gap detection to work from 1st message onwards
        for (const publisherId of PUBLISHER_IDS) {
            await addMessageToUtil(groundTruthMessages[publisherId][0], 0)
        }

        const arrivingMessages = shuffle(Object.values(groundTruthMessages).flat())
            .filter(({ missing, initiallyMissing }) => !missing && !initiallyMissing)
        for (const msgInfo of arrivingMessages) {
            await addMessageToUtil(msgInfo, MAX_MESSAGE_ARRIVAL_LATENCY)
        }

        await Promise.race([
            waitForCondition(() => PUBLISHER_IDS.every((publisherId) => expected[publisherId].length === actual[publisherId].length), 30*1000),
            wait(29 * 1000)
        ])
        expect(expected).toStrictEqual(actual)
    }, 60 * 1000)
})
