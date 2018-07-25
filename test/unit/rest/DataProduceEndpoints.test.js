const assert = require('assert')
const EventEmitter = require('events')
const sinon = require('sinon')
const express = require('express')
const request = require('supertest')
const router = require('../../../src/rest/DataProduceEndpoints')

describe('DataProduceEndpoints', () => {
    let app
    let streamFetcher
    let partitioner
    let kafka

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
            authenticate: sinon.stub().resolves({
                streamId: 'streamId', partitions: 10,
            }),
        }
        kafka = new EventEmitter()
        kafka.send = sinon.stub().yields()

        partitioner = {
            partition: sinon.stub().returns(0),
        }

        app.use(router(streamFetcher, kafka, partitioner))
    })

    describe('producing before kafka is ready', () => {
        it('returns 503', (done) => {
            postRequest()
                .expect(503, done)
        })
    })

    describe('producing after kafka is ready', () => {
        beforeEach('kafka is ready', () => {
            kafka.emit('ready')
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

        it('should give undefined partition key to partitioner if none is defined', (done) => {
            postRequest()
                .expect(200)
                .end(() => {
                    assert(partitioner.partition.calledWith(10, undefined))
                    done()
                })
        })

        it('should call partitioner using a given partition key', (done) => {
            postRequest({
                query: {
                    pkey: 'foo',
                },
            })
                .expect(200)
                .end(() => {
                    assert(partitioner.partition.calledWith(10, 'foo'))
                    done()
                })
        })

        it('should produce to kafka', (done) => {
            postRequest()
                .expect(200)
                .end(() => {
                    assert(kafka.send.calledOnce)
                    done()
                })
        })

        it('should call kafka.send() with correct stream id and partition returned by the partitioner', (done) => {
            partitioner.partition = sinon.stub().withArgs(10, 'pkey').returns(5)
            postRequest({
                query: {
                    pkey: 'pkey',
                },
            })
                .expect(200)
                .end(() => {
                    const streamrBinaryMessage = kafka.send.getCall(0).args[0]
                    assert.equal(streamrBinaryMessage.streamId, 'streamId')
                    assert.equal(streamrBinaryMessage.streamPartition, 5)
                    done()
                })
        })

        it('should use current timestamp by default', (done) => {
            const timestamp = Date.now()
            postRequest()
                .expect(200)
                .end(() => {
                    const streamrBinaryMessage = kafka.send.getCall(0).args[0]
                    assert(streamrBinaryMessage.timestamp >= timestamp, `${streamrBinaryMessage.timestamp} >= ${timestamp}`)
                    const now = Date.now()
                    assert(streamrBinaryMessage.timestamp <= now, `${streamrBinaryMessage} <= ${now}`)
                    done()
                })
        })

        it('should use ttl if given', (done) => {
            const ttl = 30

            postRequest({
                query: {
                    ttl: ttl.toString(),
                },
            })
                .expect(200)
                .end(() => {
                    const streamrBinaryMessage = kafka.send.getCall(0).args[0]
                    assert.equal(streamrBinaryMessage.ttl, ttl)
                    done()
                })
        })

        it('should return 400 for invalid ttl', (done) => {
            postRequest({
                query: {
                    ttl: 'foo',
                },
            }).expect(400, done)
        })

        it('returns 500 if there is an error producing to kafka', (done) => {
            kafka.send = sinon.stub().yields('error')
            postRequest()
                .expect(500, done)
        })
    })
})
