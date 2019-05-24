import assert from 'assert'
import { ethers } from 'ethers'

import StreamrClient from '../../src'
import config from './config'

/**
 * These tests should be run in sequential order!
 */
describe('StreamEndpoints', () => {
    const name = `StreamEndpoints-integration-${Date.now()}`

    let client
    let createdStream
    let wallet

    const createClient = (opts = {}) => new StreamrClient({
        url: config.websocketUrl,
        restUrl: config.restUrl,
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    })

    beforeAll(() => {
        wallet = ethers.Wallet.createRandom()
        client = createClient({
            auth: {
                privateKey: wallet.privateKey,
            },
        })
    })

    describe('Stream creation', () => {
        it('createStream', () => client.createStream({
            name,
            requireSignedData: true,
        }).then((stream) => {
            createdStream = stream
            assert(createdStream.id)
            assert.equal(createdStream.name, name)
            assert.strictEqual(createdStream.requireSignedData, true)
        }).catch((err) => { throw err }))

        it('getOrCreate an existing Stream', () => client.getOrCreateStream({
            name,
        })
            .then((existingStream) => {
                assert.equal(existingStream.id, createdStream.id)
                assert.equal(existingStream.name, createdStream.name)
            }))

        it('getOrCreate a new Stream', () => {
            const newName = Date.now()
                .toString()
            return client.getOrCreateStream({
                name: newName,
            })
                .then((newStream) => {
                    assert.notEqual(newStream.id, createdStream.id)
                })
        })
    })

    it('client.getStreamPublishers should retrieve itself', async () => {
        const publishers = await client.getStreamPublishers(createdStream.id)
        assert.deepStrictEqual(publishers, [client.signer.address.toLowerCase()])
    })

    describe('Stream.update', () => {
        it('can change stream name', () => {
            createdStream.name = 'New name'
            return createdStream.update()
        })
    })

    describe('Stream configuration', () => {
        it('Stream.detectFields', (done) => {
            client.connect().then(() => {
                client.publish(createdStream.id, {
                    foo: 'bar',
                    count: 0,
                }).then(() => {
                    // Need time to propagate to storage
                    setTimeout(() => {
                        createdStream.detectFields().then((stream) => {
                            assert.deepEqual(
                                stream.config.fields,
                                [
                                    {
                                        name: 'foo',
                                        type: 'string',
                                    },
                                    {
                                        name: 'count',
                                        type: 'number',
                                    },
                                ],
                            )
                            done()
                        })
                        client.disconnect()
                    }, 10000)
                }).catch((err) => { throw err })
            })
        }, 15000)
    })

    describe('Stream permissions', () => {
        it('Stream.getPermissions', async () => {
            const permissions = await createdStream.getPermissions()
            assert.equal(permissions.length, 3) // read, write, share for the owner
        })

        it('Stream.hasPermission', async () => {
            assert(await createdStream.hasPermission('share', wallet.address))
        })

        it('Stream.grantPermission', async () => {
            await createdStream.grantPermission('read', null) // public read
            assert(await createdStream.hasPermission('read', null))
        })

        it('Stream.revokePermission', async () => {
            const publicRead = await createdStream.hasPermission('read', null)
            await createdStream.revokePermission(publicRead.id)
            assert(!(await createdStream.hasPermission('read', null)))
        })
    })

    describe('Stream deletion', () => {
        it('Stream.delete', () => createdStream.delete())
    })
})
