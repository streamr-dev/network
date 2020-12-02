const { StreamMessage, MessageID, MessageRef } = require('streamr-client-protocol').MessageLayer

const { startNetworkNode, startTracker } = require('../../src/composition')

describe('latency metrics', () => {
    let tracker
    const trackerPort = 32907

    let node1
    const port1 = 33978

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })

        node1 = await startNetworkNode({
            host: '127.0.0.1',
            port: port1,
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
        const metrics = await node1.metrics.report()
        expect(metrics.latency.last).toEqual(0)
    })

    it('should send a single message to Node1 and collect latency', (done) => {
        node1.addMessageListener(async () => {
            const metrics = await node1.metrics.report()
            expect(metrics.latency.last).toBeGreaterThan(0)
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
                const metrics = await node1.metrics.report()
                expect(metrics.latency.last).toBeGreaterThan(0)
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
