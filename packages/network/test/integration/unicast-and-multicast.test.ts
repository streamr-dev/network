import { startTracker, Tracker } from '@streamr/network-tracker'
import { wait } from '@streamr/utils'
import { MessageID, StreamMessage, StreamPartIDUtils } from 'streamr-client-protocol'
import { waitForCondition } from 'streamr-test-utils'
import { NetworkNode } from '../../src/browser'
import { createNetworkNode } from '../../src/createNetworkNode'

const STREAM_PART_ID = StreamPartIDUtils.parse('mock-stream#3')
const TRACKER_PORT = 32901

const createMockMessage = (): StreamMessage => {
    return new StreamMessage({
        messageId: new MessageID(
            StreamPartIDUtils.getStreamID(STREAM_PART_ID),
            StreamPartIDUtils.getStreamPartition(STREAM_PART_ID),
            Date.now(),
            0,
            'sender',
            'mock-msgChainId'
        ),
        content: {
            foo: 'bar'
        }
    })
}

describe('unicast and multicast', () => {

    let tracker: Tracker
    let sender: NetworkNode
    let recipient1: NetworkNode
    let recipient2: NetworkNode
    let nonRecipient: NetworkNode

    beforeEach(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: TRACKER_PORT
            }
        })
        const trackerConfig = tracker.getConfigRecord()
        sender = createNetworkNode({
            id: 'sender#mock-session-000',
            trackers: [trackerConfig],
            webrtcDisallowPrivateAddresses: false
        })
        sender.start()
        recipient1 = createNetworkNode({
            id: 'recipient#mock-session-111',
            trackers: [trackerConfig],
            webrtcDisallowPrivateAddresses: false
        })
        recipient1.start()
        recipient2 = createNetworkNode({
            id: 'recipient#mock-session-222',
            trackers: [trackerConfig],
            webrtcDisallowPrivateAddresses: false
        })
        recipient2.start()
        nonRecipient = createNetworkNode({
            id: 'non-recipient#mock-session-333',
            trackers: [trackerConfig],
            webrtcDisallowPrivateAddresses: false
        })
        nonRecipient.start()
        await recipient1.subscribeAndWaitForJoin(STREAM_PART_ID)
        await recipient2.subscribeAndWaitForJoin(STREAM_PART_ID)
        await nonRecipient.subscribeAndWaitForJoin(STREAM_PART_ID)
    })

    afterEach(async () => {
        await Promise.all([sender, recipient1, recipient2, nonRecipient].map((node) => node.stop()))
        await tracker.stop()
    })

    it('unicast', async () => {
        const onUnicastMessage1 = jest.fn()
        recipient1.addUnicastMessageListener(onUnicastMessage1)
        const onUnicastMessage2 = jest.fn()
        recipient2.addUnicastMessageListener(onUnicastMessage2)

        const message = createMockMessage()
        await sender.sendUnicastMessage(message as any, 'recipient#mock-session-111')

        await waitForCondition(() => onUnicastMessage1.mock.calls.length > 0)
        expect(onUnicastMessage1).toBeCalledTimes(1)
        expect(onUnicastMessage1.mock.calls[0][0].getParsedContent()).toEqual(message.getParsedContent())
        // wait some time so that recipient2 could possibly receive the message
        await wait(500)
        expect(onUnicastMessage2).not.toBeCalled()
    })

    it('multicast', async () => {
        const onMulticastMessage1 = jest.fn()
        recipient1.addMulticastMessageListener(onMulticastMessage1)
        const onMulticastMessage2 = jest.fn()
        recipient2.addMulticastMessageListener(onMulticastMessage2)
        const onMulticastMessage_nonRecipient = jest.fn()
        nonRecipient.addMulticastMessageListener(onMulticastMessage_nonRecipient)

        const message = createMockMessage()
        await sender.sendMulticastMessage(message as any, 'recipient')

        await waitForCondition(() => (onMulticastMessage1.mock.calls.length > 0) && (onMulticastMessage2.mock.calls.length > 0)) 
        expect(onMulticastMessage1).toBeCalledTimes(1)
        expect(onMulticastMessage1.mock.calls[0][0].getParsedContent()).toEqual(message.getParsedContent())
        expect(onMulticastMessage2).toBeCalledTimes(1)
        expect(onMulticastMessage2.mock.calls[0][0].getParsedContent()).toEqual(message.getParsedContent())
        // wait some time so that nonRecipient could possibly receive the message
        await wait(500)
        expect(onMulticastMessage_nonRecipient).not.toBeCalled()
    })
})
