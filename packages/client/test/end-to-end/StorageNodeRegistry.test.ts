import 'reflect-metadata'
import { StreamrClient } from '../../src/StreamrClient'
import { Wallet } from 'ethers'
import { createTestStream, fetchPrivateKeyWithGas, until } from '../test-utils/utils'
import { Stream } from '../../src'
import { ConfigTest, DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'
import { afterAll } from 'jest-circus'

const TEST_TIMEOUT = 256 * 1000

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
            ...ConfigTest,
            auth: {
                privateKey: creatorWallet.privateKey,
            },
        })
        listenerClient = new StreamrClient({
            ...ConfigTest,
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
            listenerClient?.unregisterStorageEventListeners()
        ])
    })

    it('add and remove', async () => {
        await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE, { timeout: 120 * 1000})
        let storageNodes = await stream.getStorageNodes()
        expect(storageNodes.length).toBe(1)
        expect(storageNodes[0]).toStrictEqual(DOCKER_DEV_STORAGE_NODE.toLowerCase())
        let stored = await creatorClient.getStoredStreamsOf(DOCKER_DEV_STORAGE_NODE)
        expect(stored.streams.some((s) => s.id === stream.id)).toBe(true)

        await stream.removeFromStorageNode(DOCKER_DEV_STORAGE_NODE)
        await until(async () => { return !(await creatorClient.isStreamStoredInStorageNode(stream.id, DOCKER_DEV_STORAGE_NODE)) }, 100000, 1000)
        storageNodes = await stream.getStorageNodes()
        expect(storageNodes).toHaveLength(0)
        stored = await creatorClient.getStoredStreamsOf(DOCKER_DEV_STORAGE_NODE)
        expect(stored.streams.some((s) => s.id === stream.id)).toBe(false)
    }, TEST_TIMEOUT)

    it('registerStorageEventListener: picks up add and remove events', async () => {
        const cb = jest.fn()
        listenerClient.registerStorageEventListener(cb)

        await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
        await stream.removeFromStorageNode(DOCKER_DEV_STORAGE_NODE)

        await until(() => cb.mock.calls.length >= 2)

        expect(cb).toHaveBeenCalledTimes(2)
        expect(cb).toHaveBeenNthCalledWith(1, {
            blockNumber: expect.any(Number),
            nodeAddress: DOCKER_DEV_STORAGE_NODE,
            streamId: stream.id,
            type: 'added'
        })
        expect(cb).toHaveBeenNthCalledWith(2, {
            blockNumber: expect.any(Number),
            nodeAddress: DOCKER_DEV_STORAGE_NODE,
            streamId: stream.id,
            type: 'removed'
        })
    }, TEST_TIMEOUT)

    it('getStoredStreamsOf', async () => {
        const result = await listenerClient.getStoredStreamsOf(DOCKER_DEV_STORAGE_NODE)
        expect(result.blockNumber).toBeGreaterThanOrEqual(0)
        expect(result.streams.length).toBeGreaterThanOrEqual(0)
        result.streams.forEach((s) => expect(s).toBeInstanceOf(Stream))
    }, TEST_TIMEOUT)
})
