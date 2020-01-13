const express = require('express')
const request = require('supertest')
const sinon = require('sinon')
const intoStream = require('into-stream')
const { ControlLayer } = require('streamr-client-protocol')
const { StreamMessage, StreamMessageV30 } = require('streamr-client-protocol').MessageLayer

const restEndpointRouter = require('../../../src/http/DataQueryEndpoints')
const HttpError = require('../../../src/errors/HttpError')

describe('DataQueryEndpoints', () => {
    let app
    let networkNode
    let streamFetcher
    let volumeLogger

    function testGetRequest(url, key = 'authKey') {
        return request(app)
            .get(url)
            .set('Accept', 'application/json')
            .set('Authorization', `Token ${key}`)
    }

    function createStreamMessage(content) {
        return new StreamMessageV30(
            ['streamId', 0, new Date(2017, 3, 1, 12, 0, 0).getTime(), 0, 'publisherId', '1'],
            null,
            StreamMessage.CONTENT_TYPES.MESSAGE,
            content,
            StreamMessage.SIGNATURE_TYPES.NONE,
            null,
        )
    }

    function createUnicastMessage(streamMessage) {
        return ControlLayer.UnicastMessage.create('subId', streamMessage)
    }

    beforeEach(() => {
        app = express()
        networkNode = {}
        streamFetcher = {
            authenticate(streamId, authKey) {
                return new Promise(((resolve, reject) => {
                    if (authKey === 'authKey') {
                        resolve({})
                    } else {
                        reject(new HttpError(403, 'GET', ''))
                    }
                }))
            },
        }
        volumeLogger = {
            logOutput: sinon.stub(),
        }
        app.use('/api/v1', restEndpointRouter(networkNode, streamFetcher, volumeLogger))
    })

    describe('Getting last events', () => {
        let streamMessages

        beforeEach(() => {
            streamMessages = [
                createStreamMessage({
                    hello: 1,
                }),
                createStreamMessage({
                    world: 2,
                }),
            ]
            networkNode.requestResendLast = jest.fn().mockReturnValue(intoStream.object(
                streamMessages.map((m) => createUnicastMessage(m))
            ))
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
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last', 'wrongKey')
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

            it('responds with arrays as body', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
                    .expect(streamMessages.map((m) => m.toArray()), done)
            })

            it('reports to volumeLogger', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
                    .expect(200, () => {
                        sinon.assert.calledWith(volumeLogger.logOutput, 22)
                        done()
                    })
            })

            it('responds with objects as body given ?wrapper=object', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?wrapper=obJECt')
                    .expect(streamMessages.map((msg) => msg.toArray(/* parseContent */ false)), done)
            })

            it('responds with arrays as body and parsed content given ?content=json', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?content=json')
                    .expect(streamMessages.map((msg) => msg.toArray(/* parseContent */ true)), done)
            })

            it('responds with objects as body and parsed content given ?wrapper=object&content=json', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?wrapper=object&content=json')
                    .expect(streamMessages.map((msg) => msg.toArray(/* parseContent */ true)), done)
            })

            it('invokes networkNode#requestResendLast once with correct arguments', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
                    .then(() => {
                        expect(networkNode.requestResendLast).toHaveBeenCalledTimes(1)
                        expect(networkNode.requestResendLast.mock.calls[0])
                            .toEqual(['streamId', 0, expect.stringMatching(/\w+/), 1])
                        done()
                    })
                    .catch(done)
            })

            it('responds 500 and error message if networkNode signals error', (done) => {
                networkNode.requestResendLast = () => intoStream.object(Promise.reject(new Error('error')))

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

                expect(networkNode.requestResendLast).toHaveBeenCalledTimes(1)
                expect(networkNode.requestResendLast).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    expect.stringMatching(/\w+/),
                    666,
                )
            })
        })
    })

    describe('From queries', () => {
        let streamMessages

        beforeEach(() => {
            streamMessages = [
                createStreamMessage({
                    a: 'a',
                }),
                createStreamMessage({
                    z: 'z',
                }),
            ]
            networkNode.requestResendFrom = () => intoStream.object(
                streamMessages.map((m) => createUnicastMessage(m))
            )
        })

        describe('?fromTimestamp=1496408255672', () => {
            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')
                    .expect(streamMessages.map((msg) => msg.toArray()), done)
            })

            it('invokes networkNode#requestResendFrom once with correct arguments', async () => {
                networkNode.requestResendFrom = jest.fn()

                await testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')

                expect(networkNode.requestResendFrom).toHaveBeenCalledTimes(1)
                expect(networkNode.requestResendFrom).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    expect.stringMatching(/\w+/),
                    1496408255672,
                    undefined,
                    null,
                    null,
                )
            })

            it('responds 500 and error message if networkNode signals error', (done) => {
                networkNode.requestResendFrom = () => intoStream.object(Promise.reject(new Error('error')))

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
                    .expect(streamMessages.map((msg) => msg.toArray()), done)
            })

            it('invokes networkNode#requestResendFrom once with correct arguments', async () => {
                networkNode.requestResendFrom = jest.fn()

                await testGetRequest(`/api/v1/streams/streamId/data/partitions/0/from?${query}`)

                expect(networkNode.requestResendFrom).toHaveBeenCalledTimes(1)
                expect(networkNode.requestResendFrom).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    expect.stringMatching(/\w+/),
                    1496408255672,
                    1,
                    'publisherId',
                    null,
                )
            })

            it('responds 500 and error message if networkNode signals error', (done) => {
                networkNode.requestResendFrom = () => intoStream.object(Promise.reject(new Error('error')))

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
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range', 'wrongKey')
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
            let streamMessages
            beforeEach(() => {
                streamMessages = [
                    createStreamMessage([6, 6, 6]),
                    createStreamMessage({
                        '6': '6',
                    }),
                ]
                networkNode.requestResendRange = () => intoStream.object(
                    streamMessages.map((m) => createUnicastMessage(m))
                )
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
                    .expect(streamMessages.map((msg) => msg.toArray()), done)
            })

            it('invokes networkNode#requestResendRange once with correct arguments', async () => {
                networkNode.requestResendRange = jest.fn()

                // eslint-disable-next-line max-len
                await testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')

                expect(networkNode.requestResendRange).toHaveBeenCalledTimes(1)
                expect(networkNode.requestResendRange).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    expect.stringMatching(/\w+/),
                    1496408255672,
                    undefined,
                    1496415670909,
                    undefined,
                    null,
                    null,
                )
            })

            it('responds 500 and error message if networkNode signals error', (done) => {
                networkNode.requestResendRange = () => intoStream.object(Promise.reject(new Error('error')))

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

            let streamMessages
            beforeEach(() => {
                streamMessages = [
                    createStreamMessage([6, 6, 6]),
                    createStreamMessage({
                        '6': '6',
                    }),
                ]
                networkNode.requestResendRange = () => intoStream.object(
                    streamMessages.map((m) => createUnicastMessage(m))
                )
            })

            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                    .expect(streamMessages.map((msg) => msg.toArray()), done)
            })

            it('invokes networkNode#requestResendRange once with correct arguments', async () => {
                networkNode.requestResendRange = jest.fn()

                await testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                expect(networkNode.requestResendRange).toHaveBeenCalledTimes(1)
                expect(networkNode.requestResendRange).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    expect.stringMatching(/\w+/),
                    1496408255672,
                    1,
                    1496415670909,
                    2,
                    'publisherId',
                    null,
                )
            })

            it('responds 500 and error message if networkNode signals error', (done) => {
                networkNode.requestResendRange = () => intoStream.object(Promise.reject(new Error('error')))

                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })
    })
})
