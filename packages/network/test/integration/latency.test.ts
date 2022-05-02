import { Tracker, startTracker } from '@streamr/network-tracker'
import { NetworkNode } from '../../src/logic/NetworkNode'
import { MessageLayer, toStreamID } from 'streamr-client-protocol'
import { MetricsContext, createNetworkNode } from '../../src/composition'

const { StreamMessage, MessageID, MessageRef } = MessageLayer

describe('latency metrics', () => {
    let tracker: Tracker
    let onMetricRecord: jest.Mock
    let node: NetworkNode

    beforeEach(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 32910
            }
        })
        const trackerInfo = tracker.getConfigRecord()
        const metricsContext = new MetricsContext()
        node = createNetworkNode({
            id: 'node1',
            trackers: [trackerInfo],
            metricsContext
        })
        onMetricRecord = jest.fn()
        metricsContext.getMetric('node.latencyAverageMs')!.on('record', onMetricRecord)
        node.start()
    })

    afterEach(async () => {
        await Promise.allSettled([
            node.stop(),
            tracker.stop()
        ])
    })

    it('should fetch empty metrics', async () => {
        expect(onMetricRecord).not.toBeCalled()
    })

    it('should send a single message to Node1 and collect latency', (done) => {
        node.addMessageListener(async () => {
            expect(onMetricRecord).toBeCalledTimes(1)
            expect(onMetricRecord.mock.calls[0][0]).toBeGreaterThan(0)
            done()
        })

        node.publish(new StreamMessage({
            messageId: new MessageID(
                toStreamID('stream-1'),
                0,
                new Date().getTime() - 1,
                0,
                'publisherId',
                'msgChainId'
            ),
            prevMsgRef: new MessageRef(0, 0),
            content: {
                messageNo: 1
            },
        }))
    })

    it('should send a bunch of messages to Node1 and collect latency',(done) => {
        let receivedMessages = 0

        node.addMessageListener(async () => {
            receivedMessages += 1

            if (receivedMessages === 5) {
                expect(onMetricRecord).toBeCalledTimes(5)
                expect(onMetricRecord.mock.calls[0][0]).toBeGreaterThan(0)
                done()
            }
        })

        for (let i = 1; i <= 5; i++) {
            node.publish(new StreamMessage({
                messageId: new MessageID(toStreamID('stream-1'), 0, i, 0, 'publisherId', 'msgChainId'),
                prevMsgRef: i === 1 ? null : new MessageRef(i - 1, 0),
                content: {
                    messageNo: i
                },
            }))
        }
    })
})
