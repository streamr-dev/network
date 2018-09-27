const assert = require('assert')
const express = require('express')
const sinon = require('sinon')
const uuid = require('uuid')
const StreamFetcher = require('../../src/StreamFetcher')
const HttpError = require('../../src/errors/HttpError')

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

        expressApp.get('/api/v1/streams/:id/permissions/me', (req, res) => requestHandlers.permissions(req, res))

        expressApp.get('/api/v1/streams/:id', (req, res) => requestHandlers.stream(req, res))

        server = expressApp.listen(6194, () => {
            console.info('Server started on port 6194\n')
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
                } else if (req.get('Authorization') !== 'token key') {
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
                } else if (req.get('Authorization') !== 'token key') {
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
                operation: 'read',
            },
        ]
    })

    describe('checkPermission', () => {
        it('returns Promise', (done) => {
            const promise = streamFetcher.checkPermission(streamId, 'key', 'read')
            promise.then((response) => {
                assert.deepEqual(response, true)
                done()
            }).catch((err) => {
                done(err)
            })
            assert(promise instanceof Promise)
        })

        it('rejects with 404 if stream does not exist', (done) => {
            streamFetcher.checkPermission('nonExistingStreamId', 'key', 'read').catch((err) => {
                assert(err instanceof HttpError)
                assert.equal(err.code, 404)
                done()
            })
        })

        it('rejects with 403 if key does not grant access to stream', (done) => {
            streamFetcher.checkPermission(streamId, 'nonExistantKey', 'read').catch((err) => {
                assert(err instanceof HttpError)
                assert.equal(err.code, 403)
                done()
            })
        })

        it('rejects with 403 if key does not provides (desired level) privilege to stream', (done) => {
            streamFetcher.checkPermission(streamId, 'key', 'write').catch((err) => {
                assert(err instanceof HttpError)
                assert.equal(err.code, 403)
                done()
            })
        })

        it('resolves with true if key provides privilege to stream', (done) => {
            streamFetcher.checkPermission(streamId, 'key', 'read').then((response) => {
                assert.deepEqual(response, true)
                done()
            }).catch((err) => {
                done(err)
            })
        })

        it('resolves with true if stream is publicly readable and read permission is requested', (done) => {
            requestHandlers.permissions = function (req, res) {
                assert.equal(req.params.id, 'publicStream')
                res.status(200).send([
                    {
                        id: null,
                        user: null,
                        operation: 'read',
                    },
                ])
            }
            streamFetcher.checkPermission('publicStream', undefined, 'read').then((response) => {
                assert.deepEqual(response, true)
                done()
            }).catch((err) => {
                done(err)
            })
        })

        it('caches repeated invocations', (done) => {
            const streamId2 = getUniqueStreamId()
            const streamId3 = getUniqueStreamId()

            Promise.all([streamFetcher.checkPermission(streamId, 'key', 'read'),
                streamFetcher.checkPermission(streamId, 'key', 'read'),
                streamFetcher.checkPermission(streamId, 'key', 'read'),
                streamFetcher.checkPermission(streamId2, 'key', 'read'),
                streamFetcher.checkPermission(streamId, 'key', 'read'),
                streamFetcher.checkPermission(streamId2, 'key', 'read'),
                streamFetcher.checkPermission(streamId3, 'key', 'read'),
                streamFetcher.checkPermission(streamId2, 'key', 'read'),
                streamFetcher.checkPermission(streamId3, 'key', 'read'),
            ]).catch(() => {
                assert.equal(numOfRequests, 3)
                done()
            })
        })

        it('does not cache errors', (done) => {
            broken = true
            streamFetcher.checkPermission(streamId, 'key', 'read').catch(() => {
                streamFetcher.checkPermission(streamId, 'key', 'read').catch(() => {
                    streamFetcher.checkPermission(streamId, 'key', 'read').catch(() => {
                        assert.equal(numOfRequests, 3)
                        broken = false
                        Promise.all([
                            streamFetcher.checkPermission(streamId, 'key', 'read'),
                            streamFetcher.checkPermission(streamId, 'key', 'read'),
                            streamFetcher.checkPermission(streamId, 'key', 'read'),
                            streamFetcher.checkPermission(streamId, 'key', 'read'),
                            streamFetcher.checkPermission(streamId, 'key', 'read'),
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
        it('returns Promise', (done) => {
            const promise = streamFetcher.fetch(streamId, 'key')
            promise.then(() => {
                done()
            }).catch((err) => {
                done(err)
            })
            assert(promise instanceof Promise)
        })

        it('rejects with 404 if stream does not exist', (done) => {
            streamFetcher.fetch('nonExistingStreamId', 'key').catch((err) => {
                assert(err instanceof HttpError)
                assert.equal(err.code, 404)
                done()
            })
        })

        it('rejects with 403 if key does not grant access to stream', (done) => {
            streamFetcher.fetch(streamId, 'nonExistantKey').catch((err) => {
                assert(err instanceof HttpError)
                assert.equal(err.code, 403)
                done()
            })
        })

        it('resolves with stream if key provides privilege to stream', (done) => {
            streamFetcher.fetch(streamId, 'key').then((stream) => {
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
            requestHandlers.stream = function (req, res) {
                assert.equal(req.params.id, 'publicStream')
                res.status(200).send(streamJson)
            }
            streamFetcher.fetch('publicStream', undefined, 'read').then((response) => {
                assert.deepEqual(response, streamJson)
                done()
            }).catch((err) => {
                done(err)
            })
        })

        it('caches repeated invocations', (done) => {
            const streamId2 = getUniqueStreamId()
            const streamId3 = getUniqueStreamId()

            Promise.all([streamFetcher.fetch(streamId, 'key'),
                streamFetcher.fetch(streamId, 'key'),
                streamFetcher.fetch(streamId, 'key'),
                streamFetcher.fetch(streamId2, 'key'),
                streamFetcher.fetch(streamId, 'key'),
                streamFetcher.fetch(streamId2, 'key'),
                streamFetcher.fetch(streamId3, 'key'),
                streamFetcher.fetch(streamId2, 'key'),
                streamFetcher.fetch(streamId3, 'key'),
            ]).catch(() => {
                assert.equal(numOfRequests, 3)
                done()
            })
        })

        it('does not cache errors', (done) => {
            broken = true
            streamFetcher.fetch(streamId, 'key').catch(() => {
                streamFetcher.fetch(streamId, 'key').catch(() => {
                    streamFetcher.fetch(streamId, 'key').catch(() => {
                        assert.equal(numOfRequests, 3)
                        broken = false
                        Promise.all([
                            streamFetcher.fetch(streamId, 'key'),
                            streamFetcher.fetch(streamId, 'key'),
                            streamFetcher.fetch(streamId, 'key'),
                            streamFetcher.fetch(streamId, 'key'),
                            streamFetcher.fetch(streamId, 'key'),
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
        it('only fetches if read permission is required', (done) => {
            streamFetcher.checkPermission = sinon.stub()
            streamFetcher.authenticate(streamId, 'key').then((json) => {
                assert.equal(numOfRequests, 1)
                assert.deepEqual(json, streamJson)
                assert(streamFetcher.checkPermission.notCalled)
                done()
            })
        })

        it('checks permission and fetches if write permission is required', (done) => {
            permissions.push({
                id: null,
                user: 'tester1@streamr.com',
                operation: 'write',
            })

            streamFetcher.authenticate(streamId, 'key', 'write').then((json) => {
                assert.equal(numOfRequests, 2)
                assert.deepEqual(json, streamJson)
                done()
            })
        })
    })
})
