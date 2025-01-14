import {
    ContentType,
    EncryptionType,
    MessageID,
    SignatureType,
    StreamMessage,
    convertStreamMessageToBytes
} from '@streamr/sdk'
import { randomUserId, toReadableStream } from '@streamr/test-utils'
import { MetricsContext, hexToBinary, toLengthPrefixedFrame, toStreamID, utf8ToBinary } from '@streamr/utils'
import express from 'express'
import { Readable } from 'stream'
import request from 'supertest'
import { toObject } from '../../../../src/plugins/storage/DataQueryFormat'
import { Storage } from '../../../../src/plugins/storage/Storage'
import {
    MAX_SEQUENCE_NUMBER_VALUE,
    MIN_SEQUENCE_NUMBER_VALUE,
    createDataQueryEndpoint
} from '../../../../src/plugins/storage/dataQueryEndpoint'

const PUBLISHER_ID = randomUserId()

const createOutputStream = (msg: StreamMessage[]): Readable => {
    return toReadableStream(...msg.map(convertStreamMessageToBytes))
}

describe('dataQueryEndpoint', () => {
    let app: express.Express
    let storage: Storage

    function testGetRequest(url: string, sessionToken = 'mock-session-token') {
        return request(app).get(url).set('Authorization', `Bearer ${sessionToken}`)
    }

    function createStreamMessage(content: any): StreamMessage {
        return new StreamMessage({
            messageId: new MessageID(
                toStreamID('streamId'),
                0,
                new Date(2017, 3, 1, 12, 0, 0).getTime(),
                0,
                PUBLISHER_ID,
                'msgChainId'
            ),
            content: utf8ToBinary(JSON.stringify(content)),
            signature: hexToBinary('0x1234'),
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.NONE,
            signatureType: SignatureType.SECP256K1
        })
    }

    beforeEach(() => {
        app = express()
        storage = {} as Storage
        const endpoint = createDataQueryEndpoint(storage, new MetricsContext())
        app.route(endpoint.path)[endpoint.method](endpoint.requestHandlers)
    })

    describe('Getting last events', () => {
        let streamMessages: StreamMessage[]

        beforeEach(() => {
            streamMessages = [
                createStreamMessage({
                    hello: 1
                }),
                createStreamMessage({
                    world: 2
                })
            ]
            storage.requestLast = jest.fn().mockReturnValue(createOutputStream(streamMessages))
        })

        describe('user errors', () => {
            it('responds 400 and error message if param "partition" not a number', (done) => {
                testGetRequest('/streams/streamId/data/partitions/zero/last').expect('Content-Type', /json/).expect(
                    400,
                    {
                        error: 'Path parameter "partition" not a number: zero'
                    },
                    done
                )
            })

            it('responds 400 and error message if optional param "count" not a number', (done) => {
                testGetRequest('/streams/streamId/data/partitions/0/last?count=sixsixsix')
                    .expect('Content-Type', /json/)
                    .expect(
                        400,
                        {
                            error: 'Query parameter "count" not a number: sixsixsix'
                        },
                        done
                    )
            })

            it('responds 400 and error message if format parameter is invalid', (done) => {
                testGetRequest('/streams/streamId/data/partitions/0/last?format=foobar')
                    .expect('Content-Type', /json/)
                    .expect(
                        400,
                        {
                            error: 'Query parameter "format" is invalid: foobar'
                        },
                        done
                    )
            })

            it('responds 400 and error message if publisherId+msgChainId combination is invalid in range request', async () => {
                const base =
                    '/streams/streamId/data/partitions/0/range?fromTimestamp=1000&toTimestamp=2000&fromSequenceNumber=1&toSequenceNumber=2'
                const suffixes = [`publisherId=${PUBLISHER_ID}`, 'msgChainId=bar']
                for (const suffix of suffixes) {
                    await testGetRequest(`${base}&${suffix}`).expect('Content-Type', /json/).expect(400, {
                        error: 'Invalid combination of "publisherId" and "msgChainId"'
                    })
                }
            })
        })

        describe('GET /streams/streamId/data/partitions/0/last', () => {
            it('responds 200 and Content-Type JSON', (done) => {
                const res = testGetRequest('/streams/streamId/data/partitions/0/last')
                res.expect('Content-Type', /json/).expect(200, done)
            })

            it('responds with object representation of messages by default', (done) => {
                testGetRequest('/streams/streamId/data/partitions/0/last').expect(
                    streamMessages.map((m) => toObject(m)),
                    done
                )
            })

            it('responds with raw format', (done) => {
                testGetRequest('/streams/streamId/data/partitions/0/last?count=2&format=raw')
                    .expect('Content-Type', 'application/octet-stream')
                    .expect(
                        Buffer.concat(streamMessages.map(convertStreamMessageToBytes).map(toLengthPrefixedFrame)),
                        done
                    )
            })

            it('invokes storage#requestLast once with correct arguments', async () => {
                await testGetRequest('/streams/streamId/data/partitions/0/last')
                expect(storage.requestLast).toHaveBeenCalledTimes(1)
                expect((storage.requestLast as jest.Mock).mock.calls[0]).toEqual(['streamId', 0, 1])
            })

            it('responds 500 and error message if storage signals error', (done) => {
                storage.requestLast = () => toReadableStream(new Error('error'))

                testGetRequest('/streams/streamId/data/partitions/0/last').expect('Content-Type', /json/).expect(
                    500,
                    {
                        error: 'Failed to fetch data!'
                    },
                    done
                )
            })
        })

        describe('?count=666', () => {
            it('passes count to storage#requestLast', async () => {
                await testGetRequest('/streams/streamId/data/partitions/0/last?count=666')

                expect(storage.requestLast).toHaveBeenCalledTimes(1)
                expect(storage.requestLast).toHaveBeenCalledWith('streamId', 0, 666)
            })
        })
    })

    describe('From queries', () => {
        let streamMessages: StreamMessage[]

        beforeEach(() => {
            streamMessages = [
                createStreamMessage({
                    a: 'a'
                }),
                createStreamMessage({
                    z: 'z'
                })
            ]
            storage.requestFrom = () => createOutputStream(streamMessages)
        })

        describe('user errors', () => {
            it('responds 400 and error message if optional param "publisherId" not a UserID', (done) => {
                testGetRequest(
                    '/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672&publisherId=foobar'
                )
                    .expect('Content-Type', /json/)
                    .expect(
                        400,
                        {
                            error: 'Query parameter "publisherId" not valid: foobar'
                        },
                        done
                    )
            })
        })

        describe('?fromTimestamp=1496408255672', () => {
            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest('/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest('/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672').expect(
                    streamMessages.map((msg) => toObject(msg)),
                    done
                )
            })

            it('invokes storage#requestFrom once with correct arguments', async () => {
                storage.requestFrom = jest.fn().mockReturnValue(createOutputStream([]))

                await testGetRequest('/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')

                expect(storage.requestFrom).toHaveBeenCalledTimes(1)
                expect(storage.requestFrom).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    1496408255672,
                    MIN_SEQUENCE_NUMBER_VALUE,
                    undefined
                )
            })

            it('responds 500 and error message if storage signals error', (done) => {
                storage.requestFrom = () => toReadableStream(new Error('error'))

                testGetRequest('/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')
                    .expect('Content-Type', /json/)
                    .expect(
                        500,
                        {
                            error: 'Failed to fetch data!'
                        },
                        done
                    )
            })
        })

        describe(`?fromTimestamp=1496408255672&fromSequenceNumber=1&publisherId=${PUBLISHER_ID}`, () => {
            const query = `fromTimestamp=1496408255672&fromSequenceNumber=1&publisherId=${PUBLISHER_ID}`

            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest(`/streams/streamId/data/partitions/0/from?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest(`/streams/streamId/data/partitions/0/from?${query}`).expect(
                    streamMessages.map((msg) => toObject(msg)),
                    done
                )
            })

            it('invokes storage#requestFrom once with correct arguments', async () => {
                storage.requestFrom = jest.fn().mockReturnValue(createOutputStream([]))

                await testGetRequest(`/streams/streamId/data/partitions/0/from?${query}`)

                expect(storage.requestFrom).toHaveBeenCalledTimes(1)
                expect(storage.requestFrom).toHaveBeenCalledWith('streamId', 0, 1496408255672, 1, PUBLISHER_ID)
            })

            it('responds 500 and error message if storage signals error', (done) => {
                storage.requestFrom = () => toReadableStream(new Error('error'))

                testGetRequest(`/streams/streamId/data/partitions/0/from?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(
                        500,
                        {
                            error: 'Failed to fetch data!'
                        },
                        done
                    )
            })
        })
    })

    describe('Range queries', () => {
        describe('user errors', () => {
            it('responds 400 and error message if param "partition" not a number', (done) => {
                testGetRequest('/streams/streamId/data/partitions/zero/range').expect('Content-Type', /json/).expect(
                    400,
                    {
                        error: 'Path parameter "partition" not a number: zero'
                    },
                    done
                )
            })
            it('responds 400 and error message if param "fromTimestamp" not given', (done) => {
                testGetRequest('/streams/streamId/data/partitions/0/range').expect('Content-Type', /json/).expect(
                    400,
                    {
                        error: 'Query parameter "fromTimestamp" required.'
                    },
                    done
                )
            })
            it('responds 400 and error message if param "fromTimestamp" not a number', (done) => {
                testGetRequest('/streams/streamId/data/partitions/0/range?fromTimestamp=notANumber')
                    .expect('Content-Type', /json/)
                    .expect(
                        400,
                        {
                            error: 'Query parameter "fromTimestamp" not a number: notANumber'
                        },
                        done
                    )
            })
            it('responds 400 and error message if param "toTimestamp" not given', (done) => {
                testGetRequest('/streams/streamId/data/partitions/0/range?fromTimestamp=1')
                    .expect('Content-Type', /json/)
                    .expect(
                        400,
                        {
                            error:
                                'Query parameter "toTimestamp" required as well. ' +
                                'To request all messages since a timestamp,' +
                                ' use the endpoint /streams/:id/data/partitions/:partition/from'
                        },
                        done
                    )
            })
            it('responds 400 and error message if optional param "toTimestamp" not a number', (done) => {
                testGetRequest('/streams/streamId/data/partitions/0/range?fromTimestamp=1&toTimestamp=notANumber')
                    .expect('Content-Type', /json/)
                    .expect(
                        400,
                        {
                            error: 'Query parameter "toTimestamp" not a number: notANumber'
                        },
                        done
                    )
            })
            it('responds 400 and error message if optional param "publisherId" not a UserID', (done) => {
                testGetRequest(
                    '/streams/streamId/data/partitions/0/range?fromTimestamp=1&toTimestamp=2&publisherId=foobar&msgChainId=x'
                )
                    .expect('Content-Type', /json/)
                    .expect(
                        400,
                        {
                            error: 'Query parameter "publisherId" not valid: foobar'
                        },
                        done
                    )
            })
        })

        describe('?fromTimestamp=1496408255672&toTimestamp=1496415670909', () => {
            let streamMessages: StreamMessage[]
            beforeEach(() => {
                streamMessages = [
                    createStreamMessage([6, 6, 6]),
                    createStreamMessage({
                        '6': '6'
                    })
                ]
                storage.requestRange = () => createOutputStream(streamMessages)
            })

            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest(
                    '/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909'
                )
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest(
                    '/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909'
                ).expect(
                    streamMessages.map((msg) => toObject(msg)),
                    done
                )
            })

            it('invokes storage#requestRange once with correct arguments', async () => {
                storage.requestRange = jest.fn().mockReturnValue(createOutputStream([]))

                await testGetRequest(
                    '/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909'
                )

                expect(storage.requestRange).toHaveBeenCalledTimes(1)
                expect(storage.requestRange).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    1496408255672,
                    MIN_SEQUENCE_NUMBER_VALUE,
                    1496415670909,
                    MAX_SEQUENCE_NUMBER_VALUE,
                    undefined,
                    undefined
                )
            })

            it('responds 500 and error message if storage signals error', (done) => {
                storage.requestRange = () => toReadableStream(new Error('error'))

                testGetRequest(
                    '/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909'
                )
                    .expect('Content-Type', /json/)
                    .expect(
                        500,
                        {
                            error: 'Failed to fetch data!'
                        },
                        done
                    )
            })
        })

        describe('?fromTimestamp=1000&toTimestamp=2000&fromSequenceNumber=1&toSequenceNumber=2', () => {
            const query = '?fromTimestamp=1000&toTimestamp=2000&fromSequenceNumber=1&toSequenceNumber=2'
            it('invokes storage#requestRange once with correct arguments', async () => {
                storage.requestRange = jest.fn().mockReturnValue(createOutputStream([]))

                await testGetRequest(`/streams/streamId/data/partitions/0/range${query}`)
                expect(storage.requestRange).toHaveBeenCalledTimes(1)
                expect(storage.requestRange).toHaveBeenCalledWith('streamId', 0, 1000, 1, 2000, 2, undefined, undefined)
            })
        })

        // eslint-disable-next-line max-len
        describe(`?fromTimestamp=1496408255672&toTimestamp=1496415670909&fromSequenceNumber=1&toSequenceNumber=2&publisherId=${PUBLISHER_ID}&msgChainId=msgChainId`, () => {
            // eslint-disable-next-line max-len
            const query = `fromTimestamp=1496408255672&toTimestamp=1496415670909&fromSequenceNumber=1&toSequenceNumber=2&publisherId=${PUBLISHER_ID}&&msgChainId=msgChainId`

            let streamMessages: StreamMessage[]
            beforeEach(() => {
                streamMessages = [
                    createStreamMessage([6, 6, 6]),
                    createStreamMessage({
                        '6': '6'
                    })
                ]
                storage.requestRange = () => createOutputStream(streamMessages)
            })

            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest(`/streams/streamId/data/partitions/0/range?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest(`/streams/streamId/data/partitions/0/range?${query}`).expect(
                    streamMessages.map((msg) => toObject(msg)),
                    done
                )
            })

            it('invokes storage#requestRange once with correct arguments', async () => {
                storage.requestRange = jest.fn().mockReturnValue(createOutputStream([]))

                await testGetRequest(`/streams/streamId/data/partitions/0/range?${query}`)
                expect(storage.requestRange).toHaveBeenCalledTimes(1)
                expect(storage.requestRange).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    1496408255672,
                    1,
                    1496415670909,
                    2,
                    PUBLISHER_ID,
                    'msgChainId'
                )
            })

            it('responds 500 and error message if storage signals error', (done) => {
                storage.requestRange = () => toReadableStream(new Error('error'))

                testGetRequest(`/streams/streamId/data/partitions/0/range?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(
                        500,
                        {
                            error: 'Failed to fetch data!'
                        },
                        done
                    )
            })
        })
    })
})
