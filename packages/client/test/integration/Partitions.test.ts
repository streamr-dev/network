import 'reflect-metadata'
import StreamrClient from '../../src'
import { createClientFactory } from '../test-utils/fake/fakeEnvironment'
import { createTestStream } from '../test-utils/utils'
import { getPublishTestStreamMessages, Msg } from '../test-utils/publish'
import { StreamMessage } from 'streamr-client-protocol'

describe('Partition', () => {

    let client: StreamrClient

    beforeEach(() => {
        client = createClientFactory().createClient()
    })

    const createStream = (props?: any) => {
        return createTestStream(client, module, props)
    }

    it('pub with no partition key selects random partition', async () => {
        const NUM_PARTITIONS = 3
        const NUM_MESSAGES = 3
        // create a new stream with multiple partitions
        const partitionStream = await createStream({
            partitions: NUM_PARTITIONS
        })

        const publishTestStreamMessages = getPublishTestStreamMessages(client, partitionStream)

        const published1 = await publishTestStreamMessages(NUM_MESSAGES)
        const published2 = await publishTestStreamMessages(NUM_MESSAGES)
        expect(published1).toHaveLength(NUM_MESSAGES)
        expect(published2).toHaveLength(NUM_MESSAGES)
        const selectedPartition = published1[0].getStreamPartition()
        // should use same partition
        expect(published1.map((s) => s.getStreamPartition())).toEqual(published1.map(() => selectedPartition))
        expect(published2.map((s) => s.getStreamPartition())).toEqual(published1.map(() => selectedPartition))
    })

    it('publishing to different streams should get different random partitions', async () => {
        const NUM_PARTITIONS = 3
        const stream1 = await createStream({
            partitions: NUM_PARTITIONS
        })
        const publishTestStreamMessages = getPublishTestStreamMessages(client, stream1)
        const published1 = await publishTestStreamMessages(1)
        const foundPartition1 = published1[0].getStreamPartition()

        // publishing to different streams should get different random partitions
        let gotDifferentPartitions = false
        for (let i = 0; i < 100; i++) {
            const stream2 = await createStream({
                partitions: NUM_PARTITIONS
            })
            const publishTestStreamMessages2 = getPublishTestStreamMessages(client, stream2)
            // eslint-disable-next-line no-await-in-loop
            const published2 = await publishTestStreamMessages2(1)
            const foundPartition2 = published2[0].getStreamPartition()
            if (foundPartition1 !== foundPartition2) {
                gotDifferentPartitions = true
                break
            }
        }

        expect(gotDifferentPartitions).toBe(true)
    })

    it('pub with string partition key can map to full partition range', async () => {
        const NUM_PARTITIONS = 3
        const partitionStream = await createStream({
            partitions: NUM_PARTITIONS
        })

        const publishTestStreamMessages = getPublishTestStreamMessages(client, partitionStream)

        // get many partitions with random keys
        // should eventually map to all partitions
        const foundPartitions: boolean[] = Array(NUM_PARTITIONS).fill(false)
        for (let i = 0; i < 100; i++) {
            // eslint-disable-next-line no-await-in-loop
            const published3 = await publishTestStreamMessages(1, {
                partitionKey: String(i),
            })
            expect(published3).toHaveLength(1)
            const foundPartition = published3[0].getStreamPartition()
            foundPartitions[foundPartition] = true
            if (foundPartitions.every((v) => v)) {
                break
            }
        }

        expect(foundPartitions).toEqual(Array(NUM_PARTITIONS).fill(true))
    })

    it('pub with same string partition key always publishes to same partition', async () => {
        const NUM_PARTITIONS = 6
        const partitionStream = await createStream({
            partitions: NUM_PARTITIONS
        })

        const publishTestStreamMessages = getPublishTestStreamMessages(client, partitionStream)
        const partitionKey = String(Math.random())
        const published = await publishTestStreamMessages(1, {
            partitionKey
        })

        // publish many times with same key
        // should always be the same
        const targetPartition = published[0].getStreamPartition()
        const foundPartitions: number[] = []
        for (let i = 0; i < 50; i++) {
            // eslint-disable-next-line no-await-in-loop
            const published2 = await publishTestStreamMessages(1, {
                partitionKey,
            })
            expect(published2).toHaveLength(1)
            foundPartitions.push(published2[0].getStreamPartition())
        }

        expect(foundPartitions).toEqual(foundPartitions.map(() => targetPartition))
    })

    it('pub/sub with numeric partition key publishes to that key', async () => {
        const NUM_PARTITIONS = 3
        const NUM_MESSAGES = 3
        // create a new stream with multiple partitions
        const partitionStream = await createStream({
            partitions: NUM_PARTITIONS
        })

        const publishTestStreamMessages = getPublishTestStreamMessages(client, partitionStream)
        const eachPartition = Array(NUM_PARTITIONS).fill(0).map((_v, streamPartition) => streamPartition)

        // subscribe to each partition
        const subs = await Promise.all(eachPartition.map((streamPartition) => {
            return client.subscribe<typeof Msg>({
                streamId: partitionStream.id,
                partition: streamPartition,
            })
        }))

        // publish to each partition
        const pubs = await Promise.all(eachPartition.map((streamPartition) => {
            return publishTestStreamMessages(NUM_MESSAGES, { partitionKey: streamPartition })
        }))

        // check messages match
        const actualMessages: StreamMessage[][] = await Promise.all(subs.map((s) => s.collect(NUM_MESSAGES)))
        expect(actualMessages.flat().map((m) => m.signature)).toEqual(pubs.flat().map((m) => m.signature))
        // check all published messages have appropriate partition
        // i.e. [[0,0,0], [1,1,1], etc]
        expect(pubs.map((msgs) => msgs.map((msg) => msg.getStreamPartition())))
            .toEqual(pubs.map((msgs, index) => msgs.map(() => index)))
    })
})
