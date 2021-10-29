import assert from 'assert'
import { StreamFetcher } from '../../src/StreamFetcher'
import { createClient, createTestStream, getPrivateKey } from '../utils'
import { startTracker } from 'streamr-network'
import StreamrClient, { StreamOperation } from 'streamr-client'
import { Wallet } from '@ethersproject/wallet'

jest.setTimeout(30000)

describe('StreamFetcher', () => {
    let streamFetcher: StreamFetcher
    let client: StreamrClient
    let streamId: string

    beforeAll(async() => {

        const tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 29892
            },
            id: 'tracker-1'
        })
        client = createClient(tracker, await getPrivateKey(), {})
        streamId = (await createTestStream(client, module)).streamId

        streamFetcher = new StreamFetcher(client)

    })

    describe('checkPermission', () => {
        it('returns Promise', async () => {
            const promise = streamFetcher.checkPermission(streamId, await client.getAddress(), StreamOperation.STREAM_SUBSCRIBE)
            assert(promise instanceof Promise)
            // await promise
        })

        it('rejects with NOT_FOUND if stream does not exist', async () => {
            await streamFetcher.checkPermission('nonExistingStreamId', await client.getAddress(),
                StreamOperation.STREAM_SUBSCRIBE).catch((err: any) => {
                assert.equal(err.errorCode, 'NOT_FOUND')
            })
        })
        it('rejects with err if address does not grant access to stream', async () => {
            const wallet = Wallet.createRandom()
            streamFetcher.checkPermission(streamId, await wallet.getAddress(), StreamOperation.STREAM_SUBSCRIBE).catch((err: any) => {
                expect(err).toContain('does not have permission')
            })
        })

        it('rejects with unauthorized if session token does not provide (desired level) privilege to stream', async () => {
            const wallet = Wallet.createRandom()
            await streamFetcher.checkPermission(streamId, await wallet.getAddress(), StreamOperation.STREAM_PUBLISH).catch((err: any) => {
                expect(err.message).toContain('unauthorized')
                expect(err.message).toContain('does not have permission')
            })
        })

        it('resolves with true if session token provides privilege to stream', async () => {
            const res = await streamFetcher.checkPermission(streamId, await client.getAddress(), StreamOperation.STREAM_SUBSCRIBE)
            expect(res).toEqual(true)
        })

        it('resolves with true if stream is publicly readable and read permission is requested', async () => {
            const stream = await client.getStream(streamId)
            const wallet = Wallet.createRandom()
            await stream.grantPublicPermission(StreamOperation.STREAM_SUBSCRIBE)
            await streamFetcher.checkPermission(streamId, await wallet.getAddress(), StreamOperation.STREAM_SUBSCRIBE).then((response: any) => {
                return assert.deepEqual(response, true)
            })
        })

        // it('escapes any forward slashes ("/") in streamId', async () => {
        //     streamId = 'sandbox/stream/aaa'
        //     await streamFetcher.checkPermission('sandbox/stream/aaa', StreamOperation.STREAM_SUBSCRIBE, null)
        //     expect(numOfRequests).toEqual(1) // would not land at handler if "/" not escaped
        // })

        // it('caches repeated invocations', async () => {
        //     const streamId2 = (await createTestStream(client, module)).streamId
        //     const streamId3 = (await createTestStream(client, module)).streamId

        //     await Promise.all([streamFetcher.checkPermission(streamId, StreamOperation.STREAM_SUBSCRIBE, null),
        //         streamFetcher.checkPermission(streamId, StreamOperation.STREAM_SUBSCRIBE, null),
        //         streamFetcher.checkPermission(streamId, StreamOperation.STREAM_SUBSCRIBE, null),
        //         streamFetcher.checkPermission(streamId2, StreamOperation.STREAM_SUBSCRIBE, null),
        //         streamFetcher.checkPermission(streamId, StreamOperation.STREAM_SUBSCRIBE, null),
        //         streamFetcher.checkPermission(streamId2, StreamOperation.STREAM_SUBSCRIBE, null),
        //         streamFetcher.checkPermission(streamId3, StreamOperation.STREAM_SUBSCRIBE, null),
        //         streamFetcher.checkPermission(streamId2, StreamOperation.STREAM_SUBSCRIBE, null),
        //         streamFetcher.checkPermission(streamId3, StreamOperation.STREAM_SUBSCRIBE, null),
        //     ]).catch(() => {
        //         assert.equal(numOfRequests, 3)
        //     })
        // })

        // it('does not cache errors', (done) => {
        //     broken = true
        //     streamFetcher.checkPermission(streamId, StreamOperation.STREAM_SUBSCRIBE, null).catch(() => {
        //         streamFetcher.checkPermission(streamId, StreamOperation.STREAM_SUBSCRIBE, null).catch(() => {
        //             streamFetcher.checkPermission(streamId, StreamOperation.STREAM_SUBSCRIBE, null).catch(() => {
        //                 assert.equal(numOfRequests, 3)
        //                 broken = false
        //                 Promise.all([
        //                     streamFetcher.checkPermission(streamId, StreamOperation.STREAM_SUBSCRIBE, null),
        //                     streamFetcher.checkPermission(streamId, StreamOperation.STREAM_SUBSCRIBE, null),
        //                     streamFetcher.checkPermission(streamId, StreamOperation.STREAM_SUBSCRIBE, null),
        //                     streamFetcher.checkPermission(streamId, StreamOperation.STREAM_SUBSCRIBE, null),
        //                     streamFetcher.checkPermission(streamId, StreamOperation.STREAM_SUBSCRIBE, null),
        //                 ]).then(() => {
        //                     assert.equal(numOfRequests, 3 + 1)
        //                     done()
        //                 }).catch(() => {
        //                     done(new Error('test fail'))
        //                 })
        //             })
        //         })
        //     })
        // })
    })

    describe('fetch', () => {
        it('returns Promise', async () => {
            const promise = streamFetcher.fetch(streamId)
            assert(promise instanceof Promise)
            await promise
        })

        it('rejects with NOT_FOUND if stream does not exist', async () => {
            await streamFetcher.fetch('nonExistingStreamId').catch((err: any) => {
                assert.equal(err.errorCode, 'NOT_FOUND')
            })
        })

        // it('rejects with unauthorized if session token does not grant access to stream', (done) => {
        //     streamFetcher.fetch(streamId).catch((err: Todo) => {
        //         expect(err.errorCode).toContain('unauthorized')
        //         done()
        //     })
        // })

        it('resolves with stream if session token provides privilege to stream', async () => {
            const stream = await streamFetcher.fetch(streamId)
            expect(stream.streamId).toEqual(streamId)
            expect(stream.partitions).toEqual(1)
        })

        // it('resolves with stream if stream is publicly readable', (done) => {
        //     requestHandlers.stream = (req: Request, res: Response) => {
        //         assert.equal(req.params.id, 'publicStream')
        //         res.status(200).send(streamJson)
        //     }
        //     streamFetcher.fetch('publicStream').then((response: Todo) => {
        //         assert.deepEqual(response, streamJson)
        //         done()
        //     }).catch((err: Todo) => {
        //         done(err)
        //     })
        // })

        // it('escapes any forward slashes ("/") in streamId', async () => {
        //     await streamFetcher.fetch('sandbox/stream/aaa')
        //     expect(numOfRequests).toEqual(1) // would not land at handler if "/" not escaped
        // })

        // it('caches repeated invocations', async () => {
        //     const streamId2 = (await createTestStream(client, module)).streamId
        //     const streamId3 = (await createTestStream(client, module)).streamId

        //     await Promise.all([streamFetcher.fetch(streamId),
        //         streamFetcher.fetch(streamId),
        //         streamFetcher.fetch(streamId),
        //         streamFetcher.fetch(streamId2),
        //         streamFetcher.fetch(streamId),
        //         streamFetcher.fetch(streamId2),
        //         streamFetcher.fetch(streamId3),
        //         streamFetcher.fetch(streamId2),
        //         streamFetcher.fetch(streamId3),
        //     ]).catch(() => {
        //         assert.equal(numOfRequests, 3)
        //     })
        // })

        // it('does not cache errors', (done) => {
        //     broken = true
        //     streamFetcher.fetch(streamId).catch(() => {
        //         streamFetcher.fetch(streamId).catch(() => {
        //             streamFetcher.fetch(streamId).catch(() => {
        //                 assert.equal(numOfRequests, 3)
        //                 broken = false
        //                 Promise.all([
        //                     streamFetcher.fetch(streamId),
        //                     streamFetcher.fetch(streamId),
        //                     streamFetcher.fetch(streamId),
        //                     streamFetcher.fetch(streamId),
        //                     streamFetcher.fetch(streamId),
        //                 ]).then(() => {
        //                     assert.equal(numOfRequests, 3 + 1)
        //                     done()
        //                 }).catch(() => {
        //                     done(new Error('test fail'))
        //                 })
        //             })
        //         })
        //     })
        // })
    })

    // describe('authenticate', () => {
    // it('fails if the requested permission has not been granted', (done) => {
    //     // Only stream_get permission
    //     permissions = [
    //         {
    //             id: null,
    //             user: 'tester1@streamr.com',
    //             operation: 'stream_get',
    //         }
    //     ]

    //     // Should reject promise
    //     streamFetcher.authenticate(streamId, StreamOperation.STREAM_SUBSCRIBE, null)
    //         .catch((_err: Todo) => {
    //             done()
    //         })
    // })

    // it('accepts and returns stream if the permission is granted', (done) => {
    //     permissions.push({
    //         id: null,
    //         user: 'tester1@streamr.com',
    //         operation: 'stream_publish',
    //     })

    // streamFetcher.authenticate(streamId, StreamOperation.STREAM_PUBLISH, null).then((json: Todo) => {
    //     assert.equal(numOfRequests, 2)
    //     assert.deepEqual(json, streamJson)
    //     done()
    // }).catch(() => {
    //     done(new Error('test fail'))
    // })
    // })

    // it('fails with an invalid session token', (done) => {
    //     streamFetcher.authenticate(streamId, StreamOperation.STREAM_SUBSCRIBE, null).catch((_err: Todo) => {
    //         assert.equal(numOfRequests, 1)
    //         done()
    //     })
    // })

    // it('escapes any forward slashes ("/") in streamId', async () => {
    //     streamId = 'sandbox/stream/aaa'
    //     await streamFetcher.authenticate('sandbox/stream/aaa', StreamOperation.STREAM_SUBSCRIBE, null)
    //     expect(numOfRequests).toEqual(2) // would not land at handlers if "/" not escaped
    // })

    // TODO: write cache tests
    // })
})
