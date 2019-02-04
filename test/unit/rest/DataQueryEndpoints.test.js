const { Readable } = require('stream')
const express = require('express')
const request = require('supertest')
const sinon = require('sinon')
const { StreamMessage, StreamMessageV30, MessageRef } = require('streamr-client-protocol').MessageLayer
const restEndpointRouter = require('../../../src/rest/DataQueryEndpoints')
const HttpError = require('../../../src/errors/HttpError')

describe('DataQueryEndpoints', () => {
    let app
    let historicalAdapterStub
    let streamFetcher
    let volumeLogger

    function testGetRequest(url, key = 'authKey') {
        return request(app)
            .get(url)
            .set('Accept', 'application/json')
            .set('Authorization', `Token ${key}`)
    }

    function streamMessage(content) {
        return new StreamMessageV30(
            ['streamId', 0, new Date(2017, 3, 1, 12, 0, 0).getTime(), 0, 'publisherId'],
            [null, 0],
            StreamMessage.CONTENT_TYPES.JSON,
            content,
            StreamMessage.SIGNATURE_TYPES.NONE,
            null,
        )
    }

    beforeEach(() => {
        app = express()
        historicalAdapterStub = {}
        streamFetcher = {
            authenticate(streamId, authKey) {
                return new Promise(((resolve, reject) => {
                    if (authKey === 'authKey') {
                        resolve({})
                    } else {
                        reject(new HttpError(403))
                    }
                }))
            },
        }
        volumeLogger = {
            logOutput: sinon.stub(),
        }
        app.use('/api/v1', restEndpointRouter(historicalAdapterStub, streamFetcher, volumeLogger))
    })

    describe('Getting last events', () => {
        const messages = [
            streamMessage({
                hello: 1,
            }),
            streamMessage({
                world: 2,
            }),
        ]

        beforeEach(() => {
            historicalAdapterStub.fetchLatest = () => {
                const readableStream = new Readable({
                    objectMode: true,
                    read() {},
                })
                messages.map((msg) => readableStream.push(msg))
                readableStream.push(null)
                return readableStream
            }
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
                console.log(res)
                res
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with arrays as body', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
                    .expect(messages.map((msg) => msg.toArray()), done)
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
                    .expect(messages.map((msg) => msg.toArray(/* parseContent */ false)), done)
            })

            it('responds with arrays as body and parsed content given ?content=json', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?content=json')
                    .expect(messages.map((msg) => msg.toArray(/* parseContent */ true)), done)
            })

            it('responds with objects as body and parsed content given ?wrapper=object&content=json', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?wrapper=object&content=json')
                    .expect(messages.map((msg) => msg.toArray(/* parseContent */ true)), done)
            })

            it('invokes historicalAdapter#getLast once with correct arguments', (done) => {
                sinon.spy(historicalAdapterStub, 'fetchLatest')

                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
                    .then(() => {
                        sinon.assert.calledOnce(historicalAdapterStub.fetchLatest)
                        sinon.assert.calledWith(historicalAdapterStub.fetchLatest, 'streamId', 0, 1)
                        done()
                    })
                    .catch(done)
            })

            it('responds 500 and error message if historicalDataAdapter signals error', (done) => {
                historicalAdapterStub.fetchLatest = () => {
                    const readableStream = new Readable({
                        objectMode: true,
                        read() {},
                    })
                    readableStream.once('newListener', (event, listener) => {
                        if (event === 'error') {
                            readableStream.addListener('error', listener)
                            readableStream.emit('error', new Error('error'))
                        }
                    })
                    return readableStream
                }

                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })

        describe('?count=666', () => {
            it('passes count to historicalAdapter#fetchLatest', (done) => {
                sinon.spy(historicalAdapterStub, 'fetchLatest')

                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?count=666')
                    .then(() => {
                        sinon.assert.calledOnce(historicalAdapterStub.fetchLatest)
                        sinon.assert.calledWith(historicalAdapterStub.fetchLatest, 'streamId', 0, 666)
                        done()
                    })
                    .catch(done)
            })
        })
    })

    describe('From queries', () => {
        const messages = [
            streamMessage({
                a: 'a',
            }),
            streamMessage({
                z: 'z',
            }),
        ]
        describe('?fromTimestamp=1496408255672', () => {
            beforeEach(() => {
                historicalAdapterStub.fetchFromTimestamp = () => {
                    const readableStream = new Readable({
                        objectMode: true,
                        read() {},
                    })
                    messages.map((msg) => readableStream.push(msg))
                    readableStream.push(null)
                    return readableStream
                }
            })

            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')
                    .expect(messages.map((msg) => msg.toArray()), done)
            })

            it('invokes historicalAdapter#getFromTimestamp once with correct arguments', (done) => {
                sinon.spy(historicalAdapterStub, 'fetchFromTimestamp')

                testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')
                    .then(() => {
                        sinon.assert.calledOnce(historicalAdapterStub.fetchFromTimestamp)
                        sinon.assert.calledWith(
                            historicalAdapterStub.fetchFromTimestamp, 'streamId', 0,
                            new Date(1496408255672),
                        )
                        done()
                    })
                    .catch(done)
            })

            it('responds 500 and error message if historicalDataAdapter signals error', (done) => {
                historicalAdapterStub.fetchFromTimestamp = () => {
                    const readableStream = new Readable({
                        objectMode: true,
                        read() {},
                    })
                    readableStream.once('newListener', (event, listener) => {
                        if (event === 'error') {
                            readableStream.addListener('error', listener)
                            readableStream.emit('error', new Error('error'))
                        }
                    })
                    return readableStream
                }

                testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })

        describe('?fromTimestamp=1496408255672&fromSequenceNumber=1&publisherId=publisherId', () => {
            beforeEach(() => {
                historicalAdapterStub.fetchFromMessageRefForPublisher = () => {
                    const readableStream = new Readable({
                        objectMode: true,
                        read() {},
                    })
                    messages.map((msg) => readableStream.push(msg))
                    readableStream.push(null)
                    return readableStream
                }
            })

            const query = 'fromTimestamp=1496408255672&fromSequenceNumber=1&publisherId=publisherId'

            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/from?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/from?${query}`)
                    .expect(messages.map((msg) => msg.toArray()), done)
            })

            it('invokes historicalAdapter#getFromTimestamp once with correct arguments', (done) => {
                sinon.spy(historicalAdapterStub, 'fetchFromMessageRefForPublisher')

                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/from?${query}`)
                    .then(() => {
                        sinon.assert.calledOnce(historicalAdapterStub.fetchFromMessageRefForPublisher)
                        sinon.assert.calledWith(
                            historicalAdapterStub.fetchFromMessageRefForPublisher, 'streamId', 0,
                            new MessageRef(1496408255672, 1), 'publisherId',
                        )
                        done()
                    })
                    .catch(done)
            })

            it('responds 500 and error message if historicalDataAdapter signals error', (done) => {
                historicalAdapterStub.fetchFromMessageRefForPublisher = () => {
                    const readableStream = new Readable({
                        objectMode: true,
                        read() {},
                    })
                    readableStream.once('newListener', (event, listener) => {
                        if (event === 'error') {
                            readableStream.addListener('error', listener)
                            readableStream.emit('error', new Error('error'))
                        }
                    })
                    return readableStream
                }

                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/from?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })
    })

    describe('Range queries', () => {
        const messages = [
            streamMessage([6, 6, 6]),
            streamMessage({
                '6': '6',
            }),
        ]
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
                        error: 'Query parameter "toTimestamp" required as well. To request all messages since a timestamp,' +
                            'use the endpoint /streams/:id/data/partitions/:partition/from',
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
            beforeEach(() => {
                historicalAdapterStub.fetchBetweenTimestamps = () => {
                    const readableStream = new Readable({
                        objectMode: true,
                        read() {},
                    })
                    messages.map((msg) => readableStream.push(msg))
                    readableStream.push(null)
                    return readableStream
                }
            })

            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')
                    .expect(messages.map((msg) => msg.toArray()), done)
            })

            it('invokes historicalAdapter#getTimestampRange once with correct arguments', (done) => {
                sinon.spy(historicalAdapterStub, 'fetchBetweenTimestamps')

                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')
                    .then(() => {
                        sinon.assert.calledOnce(historicalAdapterStub.fetchBetweenTimestamps)
                        sinon.assert.calledWith(
                            historicalAdapterStub.fetchBetweenTimestamps, 'streamId', 0,
                            new Date(1496408255672), new Date(1496415670909),
                        )
                        done()
                    })
                    .catch(done)
            })

            it('responds 500 and error message if historicalDataAdapter signals error', (done) => {
                historicalAdapterStub.fetchBetweenTimestamps = () => {
                    const readableStream = new Readable({
                        objectMode: true,
                        read() {},
                    })
                    readableStream.once('newListener', (event, listener) => {
                        if (event === 'error') {
                            readableStream.addListener('error', listener)
                            readableStream.emit('error', new Error('error'))
                        }
                    })
                    return readableStream
                }

                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })

        describe('?fromTimestamp=1496408255672&toTimestamp=1496415670909&fromSequenceNumber=1&toSequenceNumber=2&publisherId=publisherId', () => {
            const query = 'fromTimestamp=1496408255672&toTimestamp=1496415670909&fromSequenceNumber=1&toSequenceNumber=2&publisherId=publisherId'

            beforeEach(() => {
                historicalAdapterStub.fetchBetweenMessageRefsForPublisher = () => {
                    const readableStream = new Readable({
                        objectMode: true,
                        read() {},
                    })
                    messages.map((msg) => readableStream.push(msg))
                    readableStream.push(null)
                    return readableStream
                }
            })

            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                    .expect(messages.map((msg) => msg.toArray()), done)
            })

            it('invokes historicalAdapter#getTimestampRange once with correct arguments', (done) => {
                sinon.spy(historicalAdapterStub, 'fetchBetweenMessageRefsForPublisher')

                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                    .then(() => {
                        sinon.assert.calledOnce(historicalAdapterStub.fetchBetweenMessageRefsForPublisher)
                        sinon.assert.calledWith(
                            historicalAdapterStub.fetchBetweenMessageRefsForPublisher, 'streamId', 0,
                            new MessageRef(1496408255672, 1), new MessageRef(1496415670909, 2), 'publisherId',
                        )
                        done()
                    })
                    .catch(done)
            })

            it('responds 500 and error message if historicalDataAdapter signals error', (done) => {
                historicalAdapterStub.fetchBetweenMessageRefsForPublisher = () => {
                    const readableStream = new Readable({
                        objectMode: true,
                        read() {},
                    })
                    readableStream.once('newListener', (event, listener) => {
                        if (event === 'error') {
                            readableStream.addListener('error', listener)
                            readableStream.emit('error', new Error('error'))
                        }
                    })
                    return readableStream
                }

                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })
    })
})
