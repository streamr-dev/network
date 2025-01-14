import 'reflect-metadata'

import { fetchPrivateKeyWithGas, randomEthereumAddress, randomUserId } from '@streamr/test-utils'
import { EthereumAddress, collect, toEthereumAddress, toStreamID, until } from '@streamr/utils'
import { Wallet } from 'ethers'
import { CONFIG_TEST } from '../../src/ConfigTest'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { createRelativeTestStreamId, createTestStream } from '../test-utils/utils'

const TIMEOUT = 20000
const PARTITION_COUNT = 3

const TIMEOUT_CONFIG = {
    // eslint-disable-next-line no-underscore-dangle
    ...CONFIG_TEST._timeouts!,
    ensStreamCreation: {
        timeout: 5000,
        retryInterval: 200
    }
}

/**
 * These tests should be run in sequential order!
 */
describe('StreamRegistry', () => {
    let client: StreamrClient
    let wallet: Wallet
    let publicAddress: EthereumAddress
    let createdStream: Stream

    beforeAll(async () => {
        wallet = new Wallet(await fetchPrivateKeyWithGas())
        publicAddress = toEthereumAddress(wallet.address)
        client = new StreamrClient({
            environment: 'dev2',
            auth: {
                privateKey: wallet.privateKey
            },
            _timeouts: TIMEOUT_CONFIG
        })
    }, TIMEOUT)

    beforeAll(async () => {
        createdStream = await createTestStream(client, module, {
            partitions: PARTITION_COUNT
        })
    }, TIMEOUT)

    describe('createStream', () => {
        it(
            'creates a stream with correct values',
            async () => {
                const path = createRelativeTestStreamId(module)
                const stream = await client.createStream({
                    id: path
                })
                expect(stream.id).toBe(toStreamID(path, toEthereumAddress(await client.getUserId())))
            },
            TIMEOUT
        )

        it(
            'valid id',
            async () => {
                const newId = `${publicAddress}/StreamRegistry-createStream-newId-${Date.now()}`
                const newStream = await client.createStream({
                    id: newId
                })
                expect(newStream.id).toEqual(newId)
                expect(await client.getStream(newId)).toBeDefined()
            },
            TIMEOUT
        )

        it(
            'valid path',
            async () => {
                const newPath = `/StreamRegistry-createStream-newPath-${Date.now()}`
                const expectedId = `${publicAddress}${newPath}`
                const newStream = await client.createStream({
                    id: newPath
                })
                expect(newStream.id).toEqual(expectedId)
                expect(await client.getStream(expectedId)).toBeDefined()
            },
            TIMEOUT
        )

        it(
            'legacy format',
            async () => {
                const streamId = '7wa7APtlTq6EC5iTCBy6dw'
                await expect(async () => client.createStream({ id: streamId })).rejects.toThrow(
                    `stream id "${streamId}" not valid`
                )
            },
            TIMEOUT
        )

        it(
            'listener',
            async () => {
                const onStreamCreated = jest.fn()
                client.on('streamCreated', onStreamCreated)
                const validStream = await client.createStream({
                    id: createRelativeTestStreamId(module),
                    partitions: 3,
                    description: 'Foobar'
                })
                const hasBeenCalledFor = (stream: Stream) => {
                    const streamIds = onStreamCreated.mock.calls.map((c) => c[0].streamId)
                    return streamIds.includes(stream.id)
                }
                await until(() => hasBeenCalledFor(validStream))
                client.off('streamCreated', onStreamCreated)
                expect(onStreamCreated).toHaveBeenCalledWith({
                    streamId: validStream.id,
                    metadata: {
                        partitions: 3,
                        description: 'Foobar'
                    },
                    blockNumber: expect.any(Number)
                })
            },
            TIMEOUT
        )

        // TODO: re-enable test when ETH-568 has been implemented (ENS support in fast-chain)
        describe.skip('ENS', () => {
            it(
                'domain owned by user',
                async () => {
                    const streamId = `testdomain1.eth/foobar/${Date.now()}`
                    const ensOwnerClient = new StreamrClient({
                        environment: 'dev2',
                        auth: {
                            // In dev environment the testdomain1.eth is owned by 0x4178baBE9E5148c6D5fd431cD72884B07Ad855a0.
                            // The ownership is preloaded by docker-dev-chain-init (https://github.com/streamr-dev/network-contracts)
                            privateKey: '0xe5af7834455b7239881b85be89d905d6881dcb4751063897f12be1b0dd546bdb'
                        },
                        _timeouts: TIMEOUT_CONFIG
                    })
                    const newStream = await ensOwnerClient.createStream({
                        id: streamId
                    })
                    expect(newStream.id).toEqual(streamId)
                    expect(await client.getStream(streamId)).toBeDefined()
                },
                TIMEOUT
            )

            it(
                'domain not owned by user',
                async () => {
                    const streamId = 'testdomain1.eth/foobar'
                    await expect(async () => client.createStream({ id: streamId })).rejects.toThrow()
                },
                TIMEOUT
            )

            it(
                'domain not registered',
                async () => {
                    const streamId = 'some-non-registered-address.eth/foobar'
                    await expect(async () => client.createStream({ id: streamId })).rejects.toThrow()
                },
                TIMEOUT
            )
        })
    })

    describe('getStream', () => {
        it(
            'get an existing Stream',
            async () => {
                const stream = await createTestStream(client, module)
                const existingStream = await client.getStream(stream.id)
                expect(existingStream.id).toEqual(stream.id)
            },
            TIMEOUT
        )

        it(
            'get a non-existing Stream',
            async () => {
                const streamId = `${publicAddress}/StreamRegistry-nonexisting-${Date.now()}`
                return expect(() => client.getStream(streamId)).rejects.toThrowStreamrClientError({
                    code: 'STREAM_NOT_FOUND'
                })
            },
            TIMEOUT
        )
    })

    describe('getOrCreateStream', () => {
        it(
            'existing Stream by id',
            async () => {
                const existingStream = await client.getOrCreateStream({
                    id: createdStream.id
                })
                expect(existingStream.id).toBe(createdStream.id)
            },
            TIMEOUT
        )

        it(
            'new Stream by id',
            async () => {
                const newId = `${publicAddress}/StreamRegistry-getOrCreate-newId-${Date.now()}`
                const newStream = await client.getOrCreateStream({
                    id: newId
                })
                expect(newStream.id).toEqual(newId)
            },
            TIMEOUT
        )

        it(
            'new Stream by path',
            async () => {
                const newPath = `/StreamRegistry-getOrCreate-newPath-${Date.now()}`
                const newStream = await client.getOrCreateStream({
                    id: newPath
                })
                expect(newStream.id).toEqual(`${publicAddress}${newPath}`)

                // ensure can get after create i.e. doesn't try create again
                const sameStream = await client.getOrCreateStream({
                    id: newPath
                })
                expect(sameStream.id).toEqual(newStream.id)
            },
            TIMEOUT
        )

        it(
            'fails if stream prefixed with other users address',
            async () => {
                // can't create streams for other users
                const otherAddress = randomEthereumAddress()
                const newPath = `/StreamRegistry-getOrCreate-newPath-${Date.now()}`
                // backend should error
                await expect(async () => {
                    await client.getOrCreateStream({
                        id: `${otherAddress}${newPath}`
                    })
                }).rejects.toThrow(
                    `stream id "${otherAddress}${newPath}" not in namespace of authenticated user "${publicAddress}"`
                )
            },
            TIMEOUT
        )
    })

    describe('getStreamPublishers', () => {
        it(
            'retrieves a list of publishers',
            async () => {
                const publishers = await collect(client.getStreamPublishers(createdStream.id))
                expect(publishers).toEqual([await client.getUserId()])
            },
            TIMEOUT
        )
    })

    describe('isStreamPublisher', () => {
        it(
            'returns true for valid publishers',
            async () => {
                const userId = await client.getUserId()
                const valid = await client.isStreamPublisher(createdStream.id, userId)
                expect(valid).toBe(true)
            },
            TIMEOUT
        )
        it(
            'returns false for invalid publishers',
            async () => {
                const valid = await client.isStreamPublisher(createdStream.id, randomUserId())
                expect(valid).toBe(false)
            },
            TIMEOUT
        )
    })

    describe('getStreamSubscribers', () => {
        it(
            'retrieves a list of subscribers',
            async () => {
                const subscribers = await collect(client.getStreamSubscribers(createdStream.id))
                expect(subscribers).toEqual([await client.getUserId()])
            },
            TIMEOUT
        )
    })

    describe('isStreamSubscriber', () => {
        it(
            'returns true for valid subscribers',
            async () => {
                const userId = await client.getUserId()
                const valid = await client.isStreamSubscriber(createdStream.id, userId)
                expect(valid).toBe(true)
            },
            TIMEOUT
        )
        it(
            'returns false for invalid subscribers',
            async () => {
                const valid = await client.isStreamSubscriber(createdStream.id, randomUserId())
                expect(valid).toBe(false)
            },
            TIMEOUT
        )
    })

    describe('setMetadata', () => {
        it(
            'happy path',
            async () => {
                const description = `description-${Date.now()}`
                await createdStream.setMetadata({
                    description
                })
                const createdMetadata = await createdStream.getMetadata()
                await until(
                    async () => {
                        try {
                            const queriedMetadata = await (await client.getStream(createdStream.id)).getMetadata()
                            return queriedMetadata.description === createdMetadata.description
                        } catch {
                            return false
                        }
                    },
                    100000,
                    1000
                )
                // check that other fields not overwritten
                const updatedStream = await client.getStream(createdStream.id)
                expect(await updatedStream.getMetadata()).toEqual({
                    description
                })
            },
            TIMEOUT
        )
    })

    describe('delete', () => {
        it(
            'happy path',
            async () => {
                const props = { id: createRelativeTestStreamId(module) }
                const stream = await client.createStream(props)
                await client.deleteStream(stream.id)
                await until(
                    async () => {
                        try {
                            await client.getStream(stream.id)
                            return false
                        } catch (err: any) {
                            return err.code === 'STREAM_NOT_FOUND'
                        }
                    },
                    100000,
                    1000
                )
                return expect(client.getStream(stream.id)).rejects.toThrow()
            },
            TIMEOUT
        )
    })
})
