import express from 'express'
import request from 'supertest'
import { createEndpoint } from '../../../../src/plugins/http/publishEndpoint'

const MOCK_STREAM_ID = 'mock-stream-id'

describe('publishEndpoint', () => {
    let app: express.Express
    let streamrClient: any

    const createTestEndpoint = (publishFn = jest.fn().mockResolvedValue(undefined)) => {
        const app = express()
        streamrClient = {
            publish: publishFn
        }
        const endpoint = createEndpoint(streamrClient)
        app.route(endpoint.path)[endpoint.method](endpoint.requestHandlers)
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
        queryParams: any
        expectedTimestamp?: number
        expectedPartition?: number
        expectedPartitionKey?: string
    }) => {
        await postMessage(
            {
                foo: 'bar'
            },
            queryParams
        ).expect(200)
        expect(streamrClient.publish).toHaveBeenCalledTimes(1)
        expect(streamrClient.publish).toHaveBeenCalledWith(
            {
                streamId: MOCK_STREAM_ID,
                streamPartition: expectedPartition
            },
            {
                foo: 'bar'
            },
            {
                timestamp: expectedTimestamp,
                partitionKey: expectedPartitionKey,
                msgChainId: expect.any(String)
            }
        )
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

    it('msgChainId constant between publish calls', async () => {
        await postMessage(
            {
                foo: 1
            },
            {}
        )
        await postMessage(
            {
                foo: 2
            },
            {}
        )
        expect(streamrClient.publish).toHaveBeenCalledTimes(2)
        const firstMessageMsgChainId = streamrClient.publish.mock.calls[0][2].msgChainId
        const secondMessageMsgChainId = streamrClient.publish.mock.calls[1][2].msgChainId
        expect(firstMessageMsgChainId).toBeDefined()
        expect(firstMessageMsgChainId).toBe(secondMessageMsgChainId)
    })

    it('empty', async () => {
        return await postMessage(undefined).expect(400)
    })

    it('invalid json', async () => {
        return await postMessage('invalid-json').expect(400)
    })

    it('invalid timestamp', async () => {
        return await postMessage(
            {},
            {
                timestamp: 'invalid-timestamp'
            }
        ).expect(400)
    })

    it('invalid partition: string', async () => {
        return await postMessage(
            {},
            {
                partition: 'invalid-number'
            }
        ).expect(400)
    })

    it('invalid partition: negative number', async () => {
        return await postMessage(
            {},
            {
                partition: -123
            }
        ).expect(400)
    })

    it('both partition and partitionKey', async () => {
        return await postMessage(
            {},
            {
                partition: 123,
                partitionKey: 'foo'
            }
        ).expect(422)
    })

    it('publish error', async () => {
        app = createTestEndpoint(jest.fn().mockRejectedValue(new Error('mock-error')))
        return await postMessage({}).expect(500)
    })
})
