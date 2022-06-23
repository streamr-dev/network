import 'reflect-metadata'
import StreamrClient from '../../src'
import { createClientFactory } from '../test-utils/fake/fakeEnvironment'
import { createTestStream } from '../test-utils/utils'
import { getPublishTestStreamMessages, Msg } from '../test-utils/publish'

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

        // clear message creator cache and retry should get another
        // partition unless we're really unlucky and get 100 of the
        // same partition in a row.
        const foundPartitions: boolean[] = Array(NUM_PARTITIONS).fill(false)
        for (let i = 0; i < 100; i++) {
            // @ts-expect-error private
            client.publisher.pipeline.messageCreator.streamPartitioner.clear()
            // eslint-disable-next-line no-await-in-loop
            const published3 = await publishTestStreamMessages(1)
            expect(published3).toHaveLength(1)
            const foundPartition = published3[0].getStreamPartition()
            foundPartitions[foundPartition] = true
            if (foundPartitions.every((v) => v)) {
                break
            }
        }

        expect(foundPartitions).toEqual(Array(NUM_PARTITIONS).fill(true))
    })

    it('publishing to different streams should get different random partitions', async () => {
        const NUM_PARTITIONS = 3
        const partitionStream = await createStream({
            partitions: NUM_PARTITIONS
        })
        const partitionStream2 = await createStream({
            partitions: NUM_PARTITIONS
        })

        const publishTestStreamMessages = getPublishTestStreamMessages(client, partitionStream)
        const publishTestStreamMessages2 = getPublishTestStreamMessages(client, partitionStream2)

        // publishing to different streams should get different random partitions
        // clear message creator cache and retry should get another
        let gotDifferentPartitions = false
        for (let i = 0; i < 100; i++) {
            // @ts-expect-error private
            client.publisher.pipeline.messageCreator.streamPartitioner.clear()
            // eslint-disable-next-line no-await-in-loop
            const [published1, published2] = await Promise.all([
                publishTestStreamMessages(1),
                publishTestStreamMessages2(1)
            ])
            const foundPartition1 = published1[0].getStreamPartition()
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
        // even if cache is cleared
        const targetPartition = published[0].getStreamPartition()
        const foundPartitions: number[] = []
        for (let i = 0; i < 50; i++) {
            // @ts-expect-error private
            client.publisher.pipeline.messageCreator.streamPartitioner.clear()
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
        expect(await Promise.all(subs.map((s) => s.collect(NUM_MESSAGES)))).toEqual(pubs)
        // check all published messages have appropriate partition
        // i.e. [[0,0,0], [1,1,1], etc]
        expect(pubs.map((msgs) => msgs.map((msg) => msg.getStreamPartition())))
            .toEqual(pubs.map((msgs, index) => msgs.map(() => index)))
    })
})
