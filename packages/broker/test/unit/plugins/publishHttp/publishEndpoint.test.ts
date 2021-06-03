import express from 'express'
import request from 'supertest'
import { createEndpoint } from '../../../../src/plugins/publishHttp/publishEndpoint'

const MOCK_STREAM_ID = 'mock-stream-id'

describe('PublishEndpoint', () => {

    let app: express.Express
    let streamrClient: any

    const createTestEndpoint = (publishFn = jest.fn().mockResolvedValue(undefined)) => {
        const app = express()
        streamrClient = {
            publish: publishFn
        }
        app.use(createEndpoint(streamrClient as any))
        return app
    }
    
    const postMessage = (msg: any, queryParams: any = {}) => {
        return request(app)
            .post(`/streams/${MOCK_STREAM_ID}`)
            .set('Content-Type', 'application/json')
            .query(queryParams)
            .send(msg)
    }

    const assertValidPublish = async ({
        queryParams, 
        expectedTimestamp,
        expectedPartition,
        expectedPartitionKey
    }: { 
        queryParams: any,
        expectedTimestamp?: number,
        expectedPartition?: number,
        expectedPartitionKey?: string
    }) => {
        await postMessage({
            foo: 'bar'
        }, queryParams).expect(200)
        expect(streamrClient.publish).toBeCalledTimes(1)
        expect(streamrClient.publish).toBeCalledWith({
            streamId: MOCK_STREAM_ID,
            streamPartition: expectedPartition
        }, {
            foo: 'bar'
        }, expectedTimestamp, expectedPartitionKey)
    }

    beforeEach(() => {
        app = createTestEndpoint()
    })

    it('happy path: without parameters', async () => {
        return assertValidPublish({
            queryParams: {}
        })
    })

    it('happy path: timestamp as number', async () => {
        return assertValidPublish({
            queryParams: { timestamp: 12345678 },
            expectedTimestamp: 12345678
        })
    })

    it('happy path: timestamp as string', async () => {
        return assertValidPublish({
            queryParams: { timestamp: '2001-02-03T04:05:06Z' },
            expectedTimestamp: 981173106000
        })
    })

    it('happy path: partition', async () => {
        return assertValidPublish({
            queryParams: { partition: 123 },
            expectedPartition: 123
        })
    })

    it('happy path: partitionKey', async () => {
        return assertValidPublish({
            queryParams: { partitionKey: 'mock-key' },
            expectedPartitionKey: 'mock-key'
        })
    })

    it('empty', async () => {
        return await postMessage(undefined).expect(400)
    })

    it('invalid json', async () => {
        return await postMessage('invalid-json').expect(400)
    })

    it('invalid timestamp', async () => {
        return await postMessage({}, {
            timestamp: 'invalid-timestamp'
        }).expect(400)
    })

    it('invalid partition: string', async () => {
        return await postMessage({}, {
            partition: 'invalid-number'
        }).expect(400)
    })

    it('invalid partition: negative number', async () => {
        return await postMessage({}, {
            partition: -123
        }).expect(400)
    })

    it('both partition and partitionKey', async () => {
        return await postMessage({}, {
            partition: 123,
            partitionKey: 'foo'
        }).expect(422)
    })

    it('publish error', async () => {
        app = createTestEndpoint(jest.fn().mockRejectedValue(new Error('mock-error')))
        return await postMessage({}).expect(500)
    })
})
