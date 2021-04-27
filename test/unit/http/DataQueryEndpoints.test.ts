import { Protocol, MetricsContext } from 'streamr-network'
import express from 'express'
import request from 'supertest'
import intoStream from 'into-stream'
import { router as restEndpointRouter, MIN_SEQUENCE_NUMBER_VALUE, MAX_SEQUENCE_NUMBER_VALUE } from '../../../src/http/DataQueryEndpoints'
import { Storage } from '../../../src/storage/Storage'
import { HttpError } from '../../../src/errors/HttpError'
import { Todo } from '../../../src/types'

const { ControlLayer, MessageLayer } = Protocol
const { StreamMessage, MessageID } = MessageLayer

describe('DataQueryEndpoints', () => {
    let app: Todo
    let storage: Storage
    let streamFetcher: Todo

    function testGetRequest(url: string, sessionToken = 'mock-session-token') {
        return request(app)
            .get(url)
            .set('Accept', 'application/json')
            .set('Authorization', `Bearer ${sessionToken}`)
    }

    function createStreamMessage(content: any) {
        return new StreamMessage({
            messageId: new MessageID('streamId', 0, new Date(2017, 3, 1, 12, 0, 0).getTime(), 0, 'publisherId', '1'),
            content,
        })
    }

    function createUnicastMessage(streamMessage: Todo) {
        return new ControlLayer.UnicastMessage({
            requestId: 'requestId',
            streamMessage,
        })
    }

    beforeEach(() => {
        app = express()
        // @ts-expect-error
        storage = {}
        streamFetcher = {
            authenticate(streamId: string, sessionToken: string|undefined) {
                return new Promise(((resolve, reject) => {
                    if (sessionToken === 'mock-session-token') {
                        resolve({})
                    } else {
                        reject(new HttpError(403, 'GET', ''))
                    }
                }))
            },
        }
        app.use('/api/v1', restEndpointRouter(storage, streamFetcher, new MetricsContext(null as any)))
    })

    describe('Getting last events', () => {
        let streamMessages: Todo[]

        beforeEach(() => {
            streamMessages = [
                createStreamMessage({
                    hello: 1,
                }),
                createStreamMessage({
                    world: 2,
                }),
            ]
            storage.requestLast = jest.fn().mockReturnValue(intoStream.object(streamMessages))
        })

        describe('user errors', () => {
            it('responds 400 and error message if param "partition" not a number', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/zero/last')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Path parameter "partition" not a number: zero',
                    }, done)
            })

            it('responds 403 and error message if not authorized', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last', 'wrong-session-token')
                    .expect('Content-Type', /json/)
                    .expect(403, {
                        error: 'Authentication failed.',
                    }, done)
            })

            it('responds 400 and error message if optional param "count" not a number', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?count=sixsixsix')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "count" not a number: sixsixsix',
                    }, done)
            })
        })

        describe('GET /api/v1/streams/streamId/data/partitions/0/last', () => {
            it('responds 200 and Content-Type JSON', (done) => {
                const res = testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
                res
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with object representation of messages by default', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
                    .expect(streamMessages.map((m) => m.toObject()), done)
            })

            it('responds with latest version protocol serialization of messages given format=protocol', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?format=protocol')
                    .expect(streamMessages.map((msg) => msg.serialize(StreamMessage.LATEST_VERSION)), done)
            })

            it('responds with specific version protocol serialization of messages given format=protocol&version=30', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?format=protocol&version=30')
                    .expect(streamMessages.map((msg) => msg.serialize(30)), done)
            })

            it('invokes networkNode#requestResendLast once with correct arguments', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
                    .then(() => {
                        expect(storage.requestLast).toHaveBeenCalledTimes(1)
                        // @ts-expect-error
                        expect(storage.requestLast.mock.calls[0])
                            .toEqual(['streamId', 0, 1])
                        done()
                    })
                    .catch(done)
            })

            it('responds 500 and error message if networkNode signals error', (done) => {
                storage.requestLast = () => intoStream.object(Promise.reject(new Error('error')))

                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })

        describe('?count=666', () => {
            it('passes count to networkNode#requestResendLast', async () => {
                await testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?count=666')

                expect(storage.requestLast).toHaveBeenCalledTimes(1)
                expect(storage.requestLast).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    666,
                )
            })
        })
    })

    describe('From queries', () => {
        let streamMessages: Todo[]

        beforeEach(() => {
            streamMessages = [
                createStreamMessage({
                    a: 'a',
                }),
                createStreamMessage({
                    z: 'z',
                }),
            ]
            storage.requestFrom = () => intoStream.object(streamMessages)
        })

        describe('?fromTimestamp=1496408255672', () => {
            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')
                    .expect(streamMessages.map((msg) => msg.toObject()), done)
            })

            it('invokes networkNode#requestResendFrom once with correct arguments', async () => {
                storage.requestFrom = jest.fn()

                await testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')

                expect(storage.requestFrom).toHaveBeenCalledTimes(1)
                expect(storage.requestFrom).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    1496408255672,
                    MIN_SEQUENCE_NUMBER_VALUE,
                    null,
                    null,
                )
            })

            it('responds 500 and error message if networkNode signals error', (done) => {
                storage.requestFrom = () => intoStream.object(Promise.reject(new Error('error')))

                testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })

        describe('?fromTimestamp=1496408255672&fromSequenceNumber=1&publisherId=publisherId', () => {
            const query = 'fromTimestamp=1496408255672&fromSequenceNumber=1&publisherId=publisherId'

            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/from?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/from?${query}`)
                    .expect(streamMessages.map((msg) => msg.toObject()), done)
            })

            it('invokes networkNode#requestResendFrom once with correct arguments', async () => {
                storage.requestFrom = jest.fn()

                await testGetRequest(`/api/v1/streams/streamId/data/partitions/0/from?${query}`)

                expect(storage.requestFrom).toHaveBeenCalledTimes(1)
                expect(storage.requestFrom).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    1496408255672,
                    1,
                    'publisherId',
                    null,
                )
            })

            it('responds 500 and error message if networkNode signals error', (done) => {
                storage.requestFrom = () => intoStream.object(Promise.reject(new Error('error')))

                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/from?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })
    })

    describe('Range queries', () => {
        describe('user errors', () => {
            it('responds 400 and error message if param "partition" not a number', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/zero/range')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Path parameter "partition" not a number: zero',
                    }, done)
            })
            it('responds 403 and error message if not authorized', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range', 'wrong-session-token')
                    .expect('Content-Type', /json/)
                    .expect(403, {
                        error: 'Authentication failed.',
                    }, done)
            })
            it('responds 400 and error message if param "fromTimestamp" not given', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "fromTimestamp" required.',
                    }, done)
            })
            it('responds 400 and error message if param "fromTimestamp" not a number', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=endOfTime')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "fromTimestamp" not a number: endOfTime',
                    }, done)
            })
            it('responds 400 and error message if param "toTimestamp" not given', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "toTimestamp" required as well. '
                        + 'To request all messages since a timestamp,'
                            + 'use the endpoint /streams/:id/data/partitions/:partition/from',
                    }, done)
            })
            it('responds 400 and error message if optional param "toTimestamp" not a number', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1&toTimestamp=endOfLife')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "toTimestamp" not a number: endOfLife',
                    }, done)
            })
        })

        describe('?fromTimestamp=1496408255672&toTimestamp=1496415670909', () => {
            let streamMessages: Todo[]
            beforeEach(() => {
                streamMessages = [
                    createStreamMessage([6, 6, 6]),
                    createStreamMessage({
                        '6': '6',
                    }),
                ]
                storage.requestRange = () => intoStream.object(streamMessages)
            })

            it('responds 200 and Content-Type JSON', (done) => {
                // eslint-disable-next-line max-len
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                // eslint-disable-next-line max-len
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')
                    .expect(streamMessages.map((msg) => msg.toObject()), done)
            })

            it('invokes networkNode#requestResendRange once with correct arguments', async () => {
                storage.requestRange = jest.fn()

                // eslint-disable-next-line max-len
                await testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')

                expect(storage.requestRange).toHaveBeenCalledTimes(1)
                expect(storage.requestRange).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    1496408255672,
                    MIN_SEQUENCE_NUMBER_VALUE,
                    1496415670909,
                    MAX_SEQUENCE_NUMBER_VALUE,
                    null,
                    null,
                )
            })

            it('responds 500 and error message if networkNode signals error', (done) => {
                storage.requestRange = () => intoStream.object(Promise.reject(new Error('error')))

                // eslint-disable-next-line max-len
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })

        // eslint-disable-next-line max-len
        describe('?fromTimestamp=1496408255672&toTimestamp=1496415670909&fromSequenceNumber=1&toSequenceNumber=2&publisherId=publisherId', () => {
            // eslint-disable-next-line max-len
            const query = 'fromTimestamp=1496408255672&toTimestamp=1496415670909&fromSequenceNumber=1&toSequenceNumber=2&publisherId=publisherId'

            let streamMessages: Todo[]
            beforeEach(() => {
                streamMessages = [
                    createStreamMessage([6, 6, 6]),
                    createStreamMessage({
                        '6': '6',
                    }),
                ]
                storage.requestRange = () => intoStream.object(streamMessages)
            })

            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                    .expect(streamMessages.map((msg) => msg.toObject()), done)
            })

            it('invokes networkNode#requestResendRange once with correct arguments', async () => {
                storage.requestRange = jest.fn()

                await testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                expect(storage.requestRange).toHaveBeenCalledTimes(1)
                expect(storage.requestRange).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    1496408255672,
                    1,
                    1496415670909,
                    2,
                    'publisherId',
                    null,
                )
            })

            it('responds 500 and error message if networkNode signals error', (done) => {
                storage.requestRange = () => intoStream.object(Promise.reject(new Error('error')))

                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })
    })
})
