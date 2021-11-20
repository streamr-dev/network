import assert from 'assert'
import express, { Request, Response } from 'express'
import bodyParser from 'body-parser'
import { v4 as uuidv4 } from 'uuid'
import { StreamFetcher } from '../../src/StreamFetcher'
import { HttpError } from '../../src/errors/HttpError'
import http from 'http'

describe('StreamFetcher', () => {
    let streamFetcher: StreamFetcher
    let expressApp: express.Application
    let server: http.Server
    let numOfRequests: number
    let broken: boolean
    let streamJson: Record<string, unknown>
    let permissions: Array<{
            id: null | string
            user: string
            operation: string
        }>
    let requestHandlers: {
        permissions: (req: Request, res: Response) => void
        stream: (req: Request, res: Response) => void
    }
    let streamId: string

    function getUniqueStreamId() {
        return `StreamFetcher.test.js-${uuidv4()}`
    }

    beforeAll((done) => {
        // Create fake server endpoint for testing purposes
        expressApp = express()

        expressApp.use(bodyParser.json())

        expressApp.get('/api/v1/streams/:id/permissions/me', (req: Request, res: Response) => {
            requestHandlers.permissions(req, res)
        })

        expressApp.get('/api/v1/streams/:id', (req: Request, res: Response) => {
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
            permissions(req: Request, res: Response) {
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
            stream(req: Request, res: Response) {
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

        it('rejects with 404 if stream does not exist', async () => {
            const err = await streamFetcher.checkPermission('nonExistingStreamId', 'session-token', 'stream_subscribe').catch((error) => error)
            expect(err).toBeInstanceOf(HttpError)
            expect(err.code).toBe(404)
        })

        it('rejects with 403 if session token does not grant access to stream', async () => {
            const err = await streamFetcher.checkPermission(streamId, 'nonExistingSessionToken', 'stream_subscribe').catch((error) => error)
            expect(err).toBeInstanceOf(HttpError)
            expect(err.code).toBe(403)
        })

        it('rejects with 403 if session token does not provide (desired level) privilege to stream', async () => {
            const err = await streamFetcher.checkPermission(streamId, 'session-token', 'stream_publish').catch((error) => error)
            expect(err).toBeInstanceOf(HttpError)
            expect(err.code).toBe(403)
        })

        it('resolves with true if session token provides privilege to stream', async () => {
            const response = await streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe')
            expect(response).toBe(true)
        })

        it('resolves with true if stream is publicly readable and read permission is requested', async () => {
            requestHandlers.permissions = (req: Request, res: Response) => {
                assert.equal(req.params.id, 'publicStream')
                res.status(200).send([
                    {
                        id: null,
                        user: null,
                        operation: 'stream_subscribe',
                    },
                ])
            }
            const response = await streamFetcher.checkPermission('publicStream', undefined, 'stream_subscribe')
            expect(response).toBe(true)
        })

        it('escapes any forward slashes ("/") in streamId', async () => {
            streamId = 'sandbox/stream/aaa'
            await streamFetcher.checkPermission('sandbox/stream/aaa', 'session-token', 'stream_subscribe')
            expect(numOfRequests).toEqual(1) // would not land at handler if "/" not escaped
        })

        it('caches repeated invocations', async () => {
            const streamId2 = getUniqueStreamId()
            const streamId3 = getUniqueStreamId()

            await Promise.all([
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId2, 'session-token', 'stream_subscribe').catch(() => {}),
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId2, 'session-token', 'stream_subscribe').catch(() => {}),
                streamFetcher.checkPermission(streamId3, 'session-token', 'stream_subscribe').catch(() => {}),
                streamFetcher.checkPermission(streamId2, 'session-token', 'stream_subscribe').catch(() => {}),
                streamFetcher.checkPermission(streamId3, 'session-token', 'stream_subscribe').catch(() => {}),
            ])

            expect(numOfRequests).toBe(3)
        })

        it('does not cache errors', async () => {
            broken = true
            await expect(async () => (
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe')
            )).rejects.toThrow()
            await expect(async () => (
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe')
            )).rejects.toThrow()
            await expect(async () => (
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe')
            )).rejects.toThrow()
            expect(numOfRequests).toBe(3)
            broken = false
            await Promise.all([
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
                streamFetcher.checkPermission(streamId, 'session-token', 'stream_subscribe'),
            ])
            expect(numOfRequests).toBe(3 + 1)
        })
    })

    describe('fetch', () => {
        it('returns Promise', async () => {
            const promise = streamFetcher.fetch(streamId, 'session-token')
            assert(promise instanceof Promise)
            await promise
        })

        it('rejects with 404 if stream does not exist', async () => {
            const err = await streamFetcher.fetch('nonExistingStreamId', 'session-token').catch((error) => error)
            expect(err).toBeInstanceOf(HttpError)
        })

        it('rejects with 403 if session token does not grant access to stream', async () => {
            const err = await streamFetcher.fetch(streamId, 'nonExistingSessionToken').catch((error) => error)
            expect(err).toBeInstanceOf(HttpError)
            expect(err.code).toBe(403)
        })

        it('resolves with stream if session token provides privilege to stream', async () => {
            const stream = await streamFetcher.fetch(streamId, 'session-token')
            expect(stream).toEqual({
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
        })

        it('resolves with stream if stream is publicly readable', async () => {
            requestHandlers.stream = (req: Request, res: Response) => {
                assert.equal(req.params.id, 'publicStream')
                res.status(200).send(streamJson)
            }
            const response = await streamFetcher.fetch('publicStream', undefined)
            expect(response).toEqual(streamJson)
        })

        it('escapes any forward slashes ("/") in streamId', async () => {
            streamId = 'sandbox/stream/aaa'
            await streamFetcher.fetch('sandbox/stream/aaa', 'session-token')
            expect(numOfRequests).toBe(1) // would not land at handler if "/" not escaped
        })

        it('caches repeated invocations', async () => {
            const streamId2 = getUniqueStreamId()
            const streamId3 = getUniqueStreamId()

            await expect(async () => (
                await Promise.all([streamFetcher.fetch(streamId, 'session-token'),
                    streamFetcher.fetch(streamId, 'session-token'),
                    streamFetcher.fetch(streamId, 'session-token'),
                    streamFetcher.fetch(streamId2, 'session-token'),
                    streamFetcher.fetch(streamId, 'session-token'),
                    streamFetcher.fetch(streamId2, 'session-token'),
                    streamFetcher.fetch(streamId3, 'session-token'),
                    streamFetcher.fetch(streamId2, 'session-token'),
                    streamFetcher.fetch(streamId3, 'session-token'),
                ])
            )).rejects.toThrow()
            expect(numOfRequests).toBe(3)
        })

        it('does not cache errors', async () => {
            broken = true
            await expect(async () => (
                await streamFetcher.fetch(streamId, 'session-token')
            )).rejects.toThrow()
            await expect(async () => (
                await streamFetcher.fetch(streamId, 'session-token')
            )).rejects.toThrow()
            await expect(async () => (
                streamFetcher.fetch(streamId, 'session-token')
            )).rejects.toThrow()
            expect(numOfRequests).toBe(3)
            broken = false
            await Promise.all([
                streamFetcher.fetch(streamId, 'session-token'),
                streamFetcher.fetch(streamId, 'session-token'),
                streamFetcher.fetch(streamId, 'session-token'),
                streamFetcher.fetch(streamId, 'session-token'),
                streamFetcher.fetch(streamId, 'session-token'),
            ])

            expect(numOfRequests).toBe(3 + 1)
        })
    })

    describe('authenticate', () => {
        it('fails if the requested permission has not been granted', async () => {
            // Only stream_get permission
            permissions = [
                {
                    id: null,
                    user: 'tester1@streamr.com',
                    operation: 'stream_get',
                }
            ]

            // Should reject promise
            await expect(async () => (
                streamFetcher.authenticate(streamId, 'session-token', 'stream_subscribe')
            )).rejects.toThrow()
        })

        it('accepts and returns stream if the permission is granted', async () => {
            permissions.push({
                id: null,
                user: 'tester1@streamr.com',
                operation: 'stream_publish',
            })

            const json = await streamFetcher.authenticate(streamId, 'session-token', 'stream_publish')
            expect(numOfRequests).toBe(2)
            expect(json).toEqual(streamJson)
        })

        it('fails with an invalid session token', async () => {
            await expect(async () => (
                streamFetcher.authenticate(streamId, 'nonExistingSessionToken', 'stream_subscribe')
            )).rejects.toThrow()

            expect(numOfRequests).toBe(1)
        })

        it('escapes any forward slashes ("/") in streamId', async () => {
            streamId = 'sandbox/stream/aaa'
            await streamFetcher.authenticate('sandbox/stream/aaa', 'session-token', 'stream_subscribe')
            expect(numOfRequests).toEqual(2) // would not land at handlers if "/" not escaped
        })

        // TODO: write cache tests
    })
})
