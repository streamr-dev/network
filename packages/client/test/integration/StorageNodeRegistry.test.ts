import 'reflect-metadata'
import { StreamrClient } from '../../src/StreamrClient'
import { Wallet } from 'ethers'
import { clientOptions, createTestStream, fetchPrivateKeyWithGas, until } from '../utils'
import { Stream } from '../../src'
import { storageNodeTestConfig } from './devEnvironment'
import { afterAll } from 'jest-circus'

const TEST_TIMEOUT = 60 * 1000

describe('StorageNodeRegistry', () => {
    let creatorWallet: Wallet
    let listenerWallet: Wallet
    let creatorClient: StreamrClient
    let listenerClient: StreamrClient
    let stream: Stream

    beforeAll(async () => {
        creatorWallet = new Wallet(await fetchPrivateKeyWithGas())
        listenerWallet = new Wallet(await fetchPrivateKeyWithGas())
        creatorClient = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: creatorWallet.privateKey,
            },
        })
        listenerClient = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: listenerWallet.privateKey,
            },
        })
        stream = await createTestStream(creatorClient, module)
    }, TEST_TIMEOUT)

    afterAll(async () => {
        await Promise.allSettled([
            creatorClient?.destroy(),
            listenerClient?.destroy(),
            listenerClient?.unRegisterStorageEventListeners()
        ])
    })

    it('registerStorageEventListener: picks up add and remove events', async () => {
        const cb = jest.fn()
        listenerClient.registerStorageEventListener(cb)

        await stream.addToStorageNode(storageNodeTestConfig.address)
        await stream.removeFromStorageNode(storageNodeTestConfig.address)

        await until(() => cb.mock.calls.length >= 2)

        expect(cb).toHaveBeenCalledTimes(2)
        expect(cb).toHaveBeenNthCalledWith(1, {
            blockNumber: expect.any(Number),
            nodeAddress: storageNodeTestConfig.address,
            streamId: stream.id,
            type: 'added'
        })
        expect(cb).toHaveBeenNthCalledWith(2, {
            blockNumber: expect.any(Number),
            nodeAddress: storageNodeTestConfig.address,
            streamId: stream.id,
            type: 'removed'
        })
    }, TEST_TIMEOUT)

    it('getStoredStreamsOf', async () => {
        const result = await listenerClient.getStoredStreamsOf(storageNodeTestConfig.address)
        expect(result.blockNumber).toBeGreaterThanOrEqual(0)
        expect(result.streams.length).toBeGreaterThanOrEqual(0)
        result.streams.forEach((s) => expect(s).toBeInstanceOf(Stream))
    }, TEST_TIMEOUT)
})
