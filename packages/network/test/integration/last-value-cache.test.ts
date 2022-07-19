import { Tracker, startTracker } from '@streamr/network-tracker'
import { NetworkNode } from '../../src/logic/NetworkNode'
import { MessageID, MessageRef, StreamMessage, StreamPartIDUtils, toStreamID } from 'streamr-client-protocol'
import { waitForCondition } from 'streamr-test-utils'
import { createNetworkNode } from '../../src/composition'

describe('last value cache', () => {
    let tracker: Tracker
    let n1: NetworkNode
    let n2: NetworkNode

    beforeAll(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 33300
            }
        })
        const trackerInfo = tracker.getConfigRecord()

        n1 = createNetworkNode({
            id: 'node-1',
            trackers: [trackerInfo],
            disconnectionWaitTime: 200,
            webrtcDisallowPrivateAddresses: false
        })
        n2 = createNetworkNode({
            id: 'node-2',
            trackers: [trackerInfo],
            disconnectionWaitTime: 200,
            webrtcDisallowPrivateAddresses: false
        })
        ;[n1, n2].forEach((node) => node.start())
    })

    afterAll(async () => {
        await Promise.allSettled([
            tracker.stop(),
            n1.stop(),
            n2.stop(),
        ])
    })

    it('nodes saves last value when receiving message', async () => {
        const n1Messages: any[] = []
        const n2Messages: any[] = []

        n1.addMessageListener((streamMessage) => n1Messages.push({
            streamId: streamMessage.messageId.streamId,
            streamPartition: streamMessage.messageId.streamPartition,
            payload: streamMessage.getParsedContent()
        }))
        n2.addMessageListener((streamMessage) => n2Messages.push({
            streamId: streamMessage.messageId.streamId,
            streamPartition: streamMessage.messageId.streamPartition,
            payload: streamMessage.getParsedContent()
        }))
        const streamPartId = StreamPartIDUtils.parse('stream-1#0')
        n2.subscribe(streamPartId)

        for (let i = 1; i <= 5; ++i) {
            n1.publish(new StreamMessage({
                messageId: new MessageID(toStreamID('stream-1'), 0, i, 0, 'publisherId', 'msgChainId'),
                prevMsgRef: i === 1 ? null : new MessageRef(i - 1, 0),
                content: {
                    messageNo: i
                },
            }))
        }

        await waitForCondition(() => n1Messages.length === 5, 8000)
        await waitForCondition(() => n2Messages.length === 5, 8000)

        expect(n1.getLastValue()).toEqual({ messageNo: 5 })
        expect(n2.getLastValue()).toEqual({ messageNo: 5 })

    })
})
