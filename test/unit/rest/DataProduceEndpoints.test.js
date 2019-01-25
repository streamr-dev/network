const sinon = require('sinon')
const express = require('express')
const request = require('supertest')
const Protocol = require('streamr-client-protocol')
const router = require('../../../src/rest/DataProduceEndpoints')

const FailedToPublishError = require('../../../src/errors/FailedToPublishError')
const NotReadyError = require('../../../src/errors/NotReadyError')

describe('DataProduceEndpoints', () => {
    const stream = {
        streamId: 'streamId',
        partitions: 10,
    }

    let app
    let streamFetcher
    let publisherMock

    function postRequest(overridingOptions = {}) {
        const opts = Object.assign({
            streamId: 'streamId',
            body: '{}',
            key: 'authKey',
            headers: {},
            query: {},
        }, overridingOptions)

        const headers = Object.assign({
            'Content-Type': 'application/json',
            Authorization: `Token ${opts.key}`,
        }, opts.headers)

        const req = request(app)
            .post(`/streams/${opts.streamId}/data`)
        req.query(opts.query)
            .send(opts.body)

        Object.keys(headers).forEach((key) => {
            req.set(key, headers[key])
        })

        return req
    }

    beforeEach(() => {
        app = express()

        streamFetcher = {
            authenticate: sinon.stub().resolves(stream),
        }

        publisherMock = {
            publish: sinon.stub().resolves(),
            getStreamPartition: sinon.stub.returns(0),
        }

        app.use(router(streamFetcher, publisherMock))
    })

    it('should call Publisher.publish() with correct arguments', () => {
        postRequest()
            .expect(200)
            .end((err) => {
                if (err) {
                    throw err
                }
            })
        const streamMessage = new Protocol.MessageLayer.StreamMessageV30(
            [stream.streamId, 0, Date.now(), 0, ''],
            [null, 0],
            Protocol.MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
            '{}',
            Protocol.MessageLayer.StreamMessage.SIGNATURE_TYPES.NONE,
            null,
        )
        publisherMock.publish.calledWith(stream, streamMessage)
    })

    it('should read timestamp from query params', () => {
        const ts = new Date()

        postRequest({
            query: {
                ts: ts.toISOString(),
            },
        })
            .expect(200)
            .end((err) => {
                if (err) {
                    throw err
                }
            })
        const streamMessage = new Protocol.MessageLayer.StreamMessageV30(
            [stream.streamId, 0, ts, 0, ''],
            [null, 0],
            Protocol.MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
            '{}',
            Protocol.MessageLayer.StreamMessage.SIGNATURE_TYPES.NONE,
            null,
        )
        publisherMock.publish.calledWith(stream, streamMessage)
    })

    it('should read signature-related fields from query params', () => {
        postRequest({
            query: {
                signatureType: '1',
                address: 'publisher-address',
                signature: 'signature',
            },
        })
            .expect(200)
            .end((err) => {
                if (err) {
                    throw err
                }
            })
        const streamMessage = new Protocol.MessageLayer.StreamMessageV30(
            [stream.streamId, 0, Date.now(), 0, 'publisher-address'],
            [null, 0],
            Protocol.MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
            '{}',
            Protocol.MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH,
            'signature',
        )
        publisherMock.publish.calledWith(stream, streamMessage)
    })

    it('should return 200 for valid requests', (done) => {
        postRequest()
            .expect(200, done)
    })

    it('returns 503 if the publisher throws NotReadyError', (done) => {
        publisherMock.publish = sinon.stub().rejects(new NotReadyError())

        postRequest()
            .expect(503, done)
    })

    it('should return 400 if the body is empty', (done) => {
        postRequest({
            streamId: 'streamId',
            body: '',
        }).expect(400, done)
    })

    it('should return 400 for invalid timestamp', (done) => {
        postRequest({
            query: {
                ts: 'foo',
            },
        }).expect(400, done)
    })

    it('should return 413 (Payload Too Large) if body too large', (done) => {
        const body = {}
        for (let i = 0; i < 20000; ++i) {
            body[`key-${i}`] = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'
        }
        postRequest({
            body,
        })
            .expect(413, done)
    })

    it('returns 500 if there is an error producing to kafka', (done) => {
        publisherMock.publish = sinon.stub().rejects(new FailedToPublishError())
        postRequest()
            .expect(500, done)
    })
})
