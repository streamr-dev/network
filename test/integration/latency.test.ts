import { Tracker } from '../../src/logic/Tracker'
import { NetworkNode } from '../../src/NetworkNode'
import { MessageLayer } from 'streamr-client-protocol'

import { startNetworkNode, startTracker } from '../../src/composition'

const { StreamMessage, MessageID, MessageRef } = MessageLayer

describe('latency metrics', () => {
    let tracker: Tracker
    let node1: NetworkNode

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 32910,
            id: 'tracker'
        })

        node1 = await startNetworkNode({
            host: '127.0.0.1',
            port: 32911,
            id: 'node1',
            trackers: [tracker.getAddress()]
        })

        node1.start()
    })

    afterEach(async () => {
        await node1.stop()
        await tracker.stop()
    })

    it('should fetch empty metrics', async () => {
        // @ts-expect-error private field
        const metrics = await node1.metrics.report()
        expect((metrics.latency as any).last).toEqual(0)
    })

    it('should send a single message to Node1 and collect latency', (done) => {
        node1.addMessageListener(async () => {
            // @ts-expect-error private field
            const metrics = await node1.metrics.report()
            expect((metrics.latency as any).last).toBeGreaterThan(0)
            done()
        })

        node1.publish(new StreamMessage({
            messageId: new MessageID(
                'stream-1',
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

    it('should send a bunch of messages to Node1 and collect latency', async (done) => {
        let receivedMessages = 0

        node1.addMessageListener(async () => {
            receivedMessages += 1

            if (receivedMessages === 5) {
                // @ts-expect-error private field
                const metrics = await node1.metrics.report()
                expect((metrics.latency as any).last).toBeGreaterThan(0)
                done()
            }
        })

        for (let i = 1; i <= 5; i++) {
            node1.publish(new StreamMessage({
                messageId: new MessageID('stream-1', 0, i, 0, 'publisherId', 'msgChainId'),
                prevMsgRef: i === 1 ? null : new MessageRef(i - 1, 0),
                content: {
                    messageNo: i
                },
            }))
        }
    })
})
