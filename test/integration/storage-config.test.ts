import { MessageLayer } from 'streamr-client-protocol'
import { v4 as uuidv4 } from 'uuid'
import { waitForCondition, waitForEvent } from 'streamr-test-utils'
import { Tracker } from '../../src/logic/Tracker'
import { NetworkNode } from '../../src/NetworkNode'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { startTracker, startNetworkNode, startStorageNode, Storage } from '../../src/composition'
import { StreamIdAndPartition } from '../../src/identifiers'
import { MockStorageConfig } from './MockStorageConfig'

const { StreamMessage, MessageID } = MessageLayer

const HOST = '127.0.0.1'

const createMockStream = () => {
    return new StreamIdAndPartition(uuidv4(), Math.floor(Math.random() * 100))
}

const createMockMessage = (stream: StreamIdAndPartition) => {
    return new StreamMessage({
        messageId: new MessageID(stream.id, stream.partition, Date.now(), 0, 'mock-publisherId', 'mock-msgChainId'),
        content: {
            'foo': 'bar'
        }
    })
}

const createStreamMessageMatcher = (message: MessageLayer.StreamMessage) => {
    return expect.objectContaining({
        messageId: expect.objectContaining(message.messageId)
    })
}

describe('storage node', () => {
    const initialStream = createMockStream()
    let storage: Partial<Storage>
    let config: MockStorageConfig
    let tracker: Tracker
    let relayNode: NetworkNode
    let storageNode: NetworkNode

    beforeEach(async () => {
        storage = {
            store: jest.fn()
        }
        config = new MockStorageConfig()
        config.addStream(initialStream)
        tracker = await startTracker({
            host: HOST,
            port: 49800,
            id: 'tracker'
        })
        relayNode = await startNetworkNode({
            host: HOST,
            port: 49801,
            id: 'relay',
            trackers: [tracker.getAddress()]
        })
        storageNode = await startStorageNode({
            host: HOST,
            port: 49802,
            id: 'storage',
            trackers: [tracker.getAddress()],
            storages: [storage as Storage],
            storageConfig: config
        })

        // @ts-expect-error private field
        const t1 = waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)
        relayNode.start()
        await t1

        // @ts-expect-error private field
        const t2 = waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)
        storageNode.start()
        await t2
    }, 15000)

    afterEach(async () => {
        await tracker.stop()
        await relayNode.stop()
        await storageNode.stop()
    })

    it('initial stream', async () => {
        const message = createMockMessage(initialStream)
        relayNode.publish(message)
        await waitForCondition(() => (storage.store as any).mock.calls.length > 0)
        expect(storage.store).toHaveBeenCalledWith(createStreamMessageMatcher(message))
    })

    it('add stream', async () => {
        const stream = createMockStream()
        config.addStream(stream)
        const message = createMockMessage(stream)
        relayNode.publish(message)
        await waitForCondition(() => (storage.store as any).mock.calls.length > 0)
        expect(storage.store).toHaveBeenCalledWith(createStreamMessageMatcher(message))
    })

    it('remove stream', async () => {
        config.removeStream(initialStream)
        await waitForCondition(() => (storageNode.getStreams().length === 0))
    })
})
