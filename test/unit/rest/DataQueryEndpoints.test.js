const { Readable } = require('stream')
const express = require('express')
const request = require('supertest')
const sinon = require('sinon')
const Protocol = require('streamr-client-protocol')
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
        return new Protocol.MessageLayer.StreamMessageV30(
            ['streamId', 0, new Date(2017, 3, 1, 12, 0, 0).getTime(), 0, 'publisherId'],
            [null, 0],
            Protocol.MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
            content,
            Protocol.MessageLayer.StreamMessage.SIGNATURE_TYPES.NONE,
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

            it('responds 400 and error message if param "fromOffset" not a number', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=numberOfTheBeast')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "fromOffset" not a number: numberOfTheBeast',
                    }, done)
            })

            it('responds 400 and error message if param "fromTimestamp" not a number', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=endOfTime')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "fromTimestamp" not a number: endOfTime',
                    }, done)
            })

            it('responds 400 and error message if optional param "toOffset" not a number', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=1&toOffset=sixsixsix')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "toOffset" not a number: sixsixsix',
                    }, done)
            })

            it('responds 400 and error message if optional param "toTimestamp" not a number', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=1&toTimestamp=endOfLife')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "toTimestamp" not a number: endOfLife',
                    }, done)
            })

            it('responds 400 and error message if param "fromOffset" or "fromTimestamp" not given', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "fromOffset" or "fromTimestamp" required.',
                    }, done)
            })

            it('responds 400 and error message if both params "fromOffset" and "fromTimestamp" given', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=2&fromTimestamp=1')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameters "fromOffset" and "fromTimestamp" cannot be used simultaneously.',
                    }, done)
            })

            it('responds 400 and error message if both optional params "toOffset" and "toTimestamp" given', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=1&toOffset=15&toTimestamp=1321525')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameters "toOffset" and "toTimestamp" cannot be used simultaneously.',
                    }, done)
            })

            it('responds 400 and error message if param "fromOffset" used with "toTimestamp"', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=1&toTimestamp=1321525')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Using query parameters "fromOffset" and "toTimestamp" together is not yet supported.',
                    }, done)
            })

            it('responds 400 and error message if param "fromTimestamp" used with "toOffset"', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=13215215215&toOffset=666')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Using query parameters "fromTimestamp" and "toOffset" together is not yet supported.',
                    }, done)
            })
        })

        describe('?fromTimestamp=1496408255672', () => {
            const messages = [
                streamMessage({
                    a: 'a',
                }),
                streamMessage({
                    z: 'z',
                }),
            ]

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
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672')
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672')
                    .expect(messages.map((msg) => msg.toArray()), done)
            })

            it('invokes historicalAdapter#getFromTimestamp once with correct arguments', (done) => {
                sinon.spy(historicalAdapterStub, 'fetchFromTimestamp')

                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672')
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

                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672')
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })

        describe('?fromTimestamp=1496408255672&toTimestamp=1496415670909', () => {
            const messages = [
                streamMessage([6, 6, 6]),
                streamMessage({
                    '6': '6',
                }),
            ]

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
    })
})
