import sinon from 'sinon'
import express from 'express'
import request from 'supertest'
import { Protocol } from 'streamr-network'
import { router } from '../../../../src/plugins/legacyPublishHttp/DataProduceEndpoints'
import { Todo } from '../../../../src/types'

const { StreamMessage, MessageID, MessageRef } = Protocol.MessageLayer

describe('DataProduceEndpoints', () => {
    const stream = {
        id: 'streamId',
        partitions: 1,
    }

    let app: Todo
    let streamFetcher
    let publisherMock: Todo

    function postRequest(overridingOptions = {}) {
        const opts = {
            streamId: 'streamId',
            body: '{}',
            key: 'mock-session-token',
            headers: {},
            query: {},
            ...overridingOptions
        }

        const headers = {
            'Content-Type': 'application/json',
            // @ts-expect-error
            Authorization: `Bearer ${opts.sessionToken}`,
            ...opts.headers
        }

        const req = request(app)
            .post(`/streams/${opts.streamId}/data`)
        req.query(opts.query)
            .send(opts.body)

        Object.keys(headers).forEach((key) => {
            // @ts-expect-error
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
            validateAndPublish: sinon.stub().resolves(),
        }

        // @ts-expect-error
        app.use(router(streamFetcher, publisherMock, () => 0))
    })

    it('should call Publisher.validateAndPublish() with correct arguments', (done) => {
        const streamMessage = new StreamMessage({
            messageId: new MessageID(stream.id, 0, Date.now(), 0, 'publisherId', '1'),
            content: '{}',
        })
        // eslint-disable-next-line promise/catch-or-return
        postRequest({
            query: {
                ts: streamMessage.getTimestamp(),
                address: 'publisherId',
                msgChainId: '1',
                signatureType: streamMessage.signatureType,
                signature: streamMessage.signature,
            },
        }).expect(200).then(() => {
            sinon.assert.calledWith(publisherMock.validateAndPublish, streamMessage)
            done()
        })
    })

    it('should read signature-related fields', (done) => {
        const streamMessage = new StreamMessage({
            messageId: new MessageID(stream.id, 0, Date.now(), 0, 'publisherId', ''),
            content: '{}',
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
            signature: 'signature',
        })
        // eslint-disable-next-line promise/catch-or-return
        postRequest({
            query: {
                ts: streamMessage.getTimestamp(),
                address: 'publisherId',
                signatureType: streamMessage.signatureType,
                signature: streamMessage.signature,
            },
        }).expect(200).then(() => {
            sinon.assert.calledWith(publisherMock.validateAndPublish, streamMessage)
            done()
        })
    })

    it('should read sequence number and previous reference fields', (done) => {
        const streamMessage = new StreamMessage({
            messageId: new MessageID(stream.id, 0, Date.now(), 1, 'publisherId', ''),
            prevMsgRef: new MessageRef(325656645, 3),
            content: '{}',
        })
        // eslint-disable-next-line promise/catch-or-return
        postRequest({
            query: {
                ts: streamMessage.getTimestamp(),
                seq: streamMessage.messageId.sequenceNumber,
                prev_ts: streamMessage.prevMsgRef!.timestamp,
                prev_seq: streamMessage.prevMsgRef!.sequenceNumber,
                address: 'publisherId',
                signatureType: streamMessage.signatureType,
                signature: streamMessage.signature,
            },
        }).expect(200).then(() => {
            sinon.assert.calledWith(publisherMock.validateAndPublish, streamMessage)
            done()
        })
    })

    it('should return 200 for valid requests', (done) => {
        postRequest()
            .expect(200, done)
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

    it('should return 400 for invalid sequence number', (done) => {
        postRequest({
            query: {
                seq: 'foo',
            },
        }).expect(400, done)
    })

    it('should return 400 for invalid sequence number (negative number)', (done) => {
        postRequest({
            query: {
                seq: '-6',
            },
        }).expect(400, done)
    })

    it('should return 400 for invalid previous timestamp', (done) => {
        postRequest({
            query: {
                prev_ts: 'foo',
            },
        }).expect(400, done)
    })

    it('should return 400 for invalid previous sequence number', (done) => {
        postRequest({
            query: {
                prev_ts: 0,
                prev_seq: 'foo',
            },
        }).expect(400, done)
    })

    it('should return 400 for invalid signature type', (done) => {
        postRequest({
            query: {
                signatureType: 'foo',
            },
        }).expect(400, done)
    })

    it('should return 413 (Payload Too Large) if body too large', (done) => {
        const body = {}
        for (let i = 0; i < 20000; ++i) {
            // @ts-expect-error
            body[`key-${i}`] = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'
        }
        postRequest({
            body,
        })
            .expect(413, done)
    })
})
