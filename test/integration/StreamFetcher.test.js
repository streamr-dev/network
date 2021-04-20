const assert = require('assert')

const express = require('express')
const bodyParser = require('body-parser')
const uuid = require('uuid')

const { StreamFetcher } = require('../../src/StreamFetcher')
const { HttpError } = require('../../src/errors/HttpError')

describe('StreamFetcher', () => {
    let streamFetcher
    let expressApp
    let server
    let numOfRequests
    let broken
    let streamJson
    let permissions
    let requestHandlers
    let streamId

    function getUniqueStreamId() {
        return `StreamFetcher.test.js-${uuid.v4()}`
    }

    beforeAll((done) => {
        // Create fake server endpoint for testing purposes
        expressApp = express()

        expressApp.use(bodyParser.json())

        expressApp.get('/api/v1/streams/:id/permissions/me', (req, res) => {
            requestHandlers.permissions(req, res)
        })

        expressApp.get('/api/v1/streams/:id', (req, res) => {
            requestHandlers.stream(req, res)
        })

        server = expressApp.listen(6194, () => {
            console.info('Server for StreamFetcher.test.js started on port 6194\n')
            done()
        })
    })

    afterAll((done) => {
        server.close(done)
    })

    beforeEach(() => {
        streamId = getUniqueStreamId()

        numOfRequests = 0
        broken = false

        // Override these functions to adjust endpoint behavior
        requestHandlers = {
            permissions(req, res) {
                numOfRequests += 1
                if (broken) {
                    res.sendStatus(500)
                } else if (req.params.id !== streamId) {
                    res.sendStatus(404)
                } else if (req.get('Authorization') !== 'Bearer session-token') {
                    res.sendStatus(403)
                } else {
                    res.status(200).send(permissions)
                }
            },
            stream(req, res) {
                numOfRequests += 1
                if (broken) {
                    res.sendStatus(500)
                } else if (req.params.id !== streamId) {
                    res.sendStatus(404)
                } else if (req.get('Authorization') !== 'Bearer session-token') {
                    res.sendStatus(403)
                } else {
                    res.status(200).send(streamJson)
                }
            },
        }

        streamFetcher = new StreamFetcher('http://127.0.0.1:6194')

        streamJson = {
            id: streamId,
            partitions: 1,
            name: 'example stream',
            description: 'a stream used inside test',
            feed: {
                id: 'feedId',
                name: 'feedName',
                module: 7,
            },
            config: {},
        }

        permissions = [
            {
                id: null,
                user: 'tester1@streamr.com',
                operation: 'stream_get',
            },
            {
                id: null,
                user: 'tester1@streamr.com',
                operation: 'stream_subscribe',
            },
        ]
    })

    describe('checkPermission', () => {
        it('returns Promise', async () => {
            const promise = streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe')
            assert(promise instanceof Promise)
            await promise
        })

        it('rejects with 404 if stream does not exist', (done) => {
            streamFetcher.checkPermission('nonExistingStreamId', 'session-token', 'stream_subscribe').catch((err) => {
                assert(err instanceof HttpError)
                assert.equal(err.code, 404)
                done()
            })
        })
        it('rejects with 403 if session token does not grant access to stream', (done) => {
            streamFetcher.checkPermission(streamId, 'nonExistingSessionToken', 'stream_subscribe').catch((err) => {
                assert(err instanceof HttpError)
                assert.equal(err.code, 403)
                done()
            })
        })

        it('rejects with 403 if session token does not provide (desired level) privilege to stream', (done) => {
            streamFetcher.checkPermission(streamId, 'session-token', 'stream_publish').catch((err) => {
                assert(err instanceof HttpError)
                assert.equal(err.code, 403)
                done()
            })
        })

        it('resolves with true if session token provides privilege to stream', (done) => {
            streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe').then((response) => {
                assert.deepEqual(response, true)
                done()
            }).catch((err) => {
                done(err)
            })
        })

        it('resolves with true if stream is publicly readable and read permission is requested', (done) => {
            requestHandlers.permissions = (req, res) => {
                assert.equal(req.params.id, 'publicStream')
                res.status(200).send([
                    {
                        id: null,
                        user: null,
                        operation: 'stream_subscribe',
                    },
                ])
            }
            streamFetcher.checkPermission('publicStream', undefined, 'stream_subscribe').then((response) => {
                assert.deepEqual(response, true)
                done()
            }).catch((err) => {
                done(err)
            })
        })

        it('escapes any forward slashes ("/") in streamId', async () => {
            streamId = 'sandbox/stream/aaa'
            await streamFetcher.checkPermission('sandbox/stream/aaa', 'session-token', 'stream_subscribe')
            expect(numOfRequests).toEqual(1) // would not land at handler if "/" not escaped
        })

        it('caches repeated invocations', (done) => {
            const streamId2 = getUniqueStreamId()
            const streamId3 = getUniqueStreamId()

            Promise.all([streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId2, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId2, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId3, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId2, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId3, 'session-token', 'stream_subscribe'),
            ]).catch(() => {
                assert.equal(numOfRequests, 3)
                done()
            })
        })

        it('does not cache errors', (done) => {
            broken = true
            streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe').catch(() => {
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe').catch(() => {
                    streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe').catch(() => {
                        assert.equal(numOfRequests, 3)
                        broken = false
                        Promise.all([
                            streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                            streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                            streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                            streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                            streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                        ]).then(() => {
                            assert.equal(numOfRequests, 3 + 1)
                            done()
                        })
                    })
                })
            })
        })
    })

    describe('fetch', () => {
        it('returns Promise', async () => {
            const promise = streamFetcher.fetch(streamId, 'session-token')
            assert(promise instanceof Promise)
            await promise
        })

        it('rejects with 404 if stream does not exist', (done) => {
            streamFetcher.fetch('nonExistingStreamId', 'session-token').catch((err) => {
                assert(err instanceof HttpError)
                assert.equal(err.code, 404)
                done()
            })
        })

        it('rejects with 403 if session token does not grant access to stream', (done) => {
            streamFetcher.fetch(streamId, 'nonExistingSessionToken').catch((err) => {
                assert(err instanceof HttpError)
                assert.equal(err.code, 403)
                done()
            })
        })

        it('resolves with stream if session token provides privilege to stream', (done) => {
            streamFetcher.fetch(streamId, 'session-token').then((stream) => {
                assert.deepEqual(stream, {
                    id: streamId,
                    partitions: 1,
                    name: 'example stream',
                    description: 'a stream used inside test',
                    feed: {
                        id: 'feedId',
                        name: 'feedName',
                        module: 7,
                    },
                    config: {},
                })
                done()
            }).catch((err) => {
                done(err)
            })
        })

        it('resolves with stream if stream is publicly readable', (done) => {
            requestHandlers.stream = (req, res) => {
                assert.equal(req.params.id, 'publicStream')
                res.status(200).send(streamJson)
            }
            streamFetcher.fetch('publicStream', undefined).then((response) => {
                assert.deepEqual(response, streamJson)
                done()
            }).catch((err) => {
                done(err)
            })
        })

        it('escapes any forward slashes ("/") in streamId', async () => {
            streamId = 'sandbox/stream/aaa'
            await streamFetcher.fetch('sandbox/stream/aaa', 'session-token')
            expect(numOfRequests).toEqual(1) // would not land at handler if "/" not escaped
        })

        it('caches repeated invocations', (done) => {
            const streamId2 = getUniqueStreamId()
            const streamId3 = getUniqueStreamId()

            Promise.all([streamFetcher.fetch(streamId, 'session-token'),
                streamFetcher.fetch(streamId, 'session-token'),
                streamFetcher.fetch(streamId, 'session-token'),
                streamFetcher.fetch(streamId2, 'session-token'),
                streamFetcher.fetch(streamId, 'session-token'),
                streamFetcher.fetch(streamId2, 'session-token'),
                streamFetcher.fetch(streamId3, 'session-token'),
                streamFetcher.fetch(streamId2, 'session-token'),
                streamFetcher.fetch(streamId3, 'session-token'),
            ]).catch(() => {
                assert.equal(numOfRequests, 3)
                done()
            })
        })

        it('does not cache errors', (done) => {
            broken = true
            streamFetcher.fetch(streamId, 'session-token').catch(() => {
                streamFetcher.fetch(streamId, 'session-token').catch(() => {
                    streamFetcher.fetch(streamId, 'session-token').catch(() => {
                        assert.equal(numOfRequests, 3)
                        broken = false
                        Promise.all([
                            streamFetcher.fetch(streamId, 'session-token'),
                            streamFetcher.fetch(streamId, 'session-token'),
                            streamFetcher.fetch(streamId, 'session-token'),
                            streamFetcher.fetch(streamId, 'session-token'),
                            streamFetcher.fetch(streamId, 'session-token'),
                        ]).then(() => {
                            assert.equal(numOfRequests, 3 + 1)
                            done()
                        })
                    })
                })
            })
        })
    })

    describe('authenticate', () => {
        it('fails if the requested permission has not been granted', (done) => {
            // Only stream_get permission
            permissions = [
                {
                    id: null,
                    user: 'tester1@streamr.com',
                    operation: 'stream_get',
                }
            ]

            // Should reject promise
            streamFetcher.authenticate(streamId, 'session-token', 'stream_subscribe')
                .catch((err) => {
                    done()
                })
        })

        it('accepts and returns stream if the permission is granted', (done) => {
            permissions.push({
                id: null,
                user: 'tester1@streamr.com',
                operation: 'stream_publish',
            })

            streamFetcher.authenticate(streamId, 'session-token', 'stream_publish').then((json) => {
                assert.equal(numOfRequests, 2)
                assert.deepEqual(json, streamJson)
                done()
            })
        })

        it('fails with an invalid session token', (done) => {
            streamFetcher.authenticate(streamId, 'nonExistingSessionToken', 'stream_subscribe').catch((err) => {
                assert.equal(numOfRequests, 1)
                done()
            })
        })

        it('escapes any forward slashes ("/") in streamId', async () => {
            streamId = 'sandbox/stream/aaa'
            await streamFetcher.authenticate('sandbox/stream/aaa', 'session-token', 'stream_subscribe')
            expect(numOfRequests).toEqual(2) // would not land at handlers if "/" not escaped
        })

        // TODO: write cache tests
    })
})
