import 'reflect-metadata'
import { StreamrClient } from '../../src/StreamrClient'
import { Wallet } from 'ethers'
import { createTestStream } from '../test-utils/utils'
import { until } from '../../src/utils/promises'
import { Stream } from '../../src'
import { ConfigTest, DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'
import { fetchPrivateKeyWithGas } from 'streamr-test-utils'

const TEST_TIMEOUT = 30 * 1000

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
    }, TEST_TIMEOUT)

    afterAll(async () => {
        await Promise.allSettled([
            creatorClient?.destroy(),
            listenerClient?.destroy()
        ])
    })

    it('add and remove', async () => {
        stream = await createTestStream(creatorClient, module)

        await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
        let storageNodes = await stream.getStorageNodes()
        expect(storageNodes.length).toBe(1)
        expect(storageNodes[0]).toStrictEqual(DOCKER_DEV_STORAGE_NODE.toLowerCase())
        let stored = await creatorClient.getStoredStreams(DOCKER_DEV_STORAGE_NODE)
        expect(stored.streams.some((s) => s.id === stream.id)).toBe(true)

        await stream.removeFromStorageNode(DOCKER_DEV_STORAGE_NODE)
        await until(async () => { return !(await creatorClient.isStoredStream(stream.id, DOCKER_DEV_STORAGE_NODE)) }, 100000, 1000)
        storageNodes = await stream.getStorageNodes()
        expect(storageNodes).toHaveLength(0)
        stored = await creatorClient.getStoredStreams(DOCKER_DEV_STORAGE_NODE)
        expect(stored.streams.some((s) => s.id === stream.id)).toBe(false)
    }, TEST_TIMEOUT)

    it('event listener: picks up add and remove events', async () => {
        stream = await createTestStream(creatorClient, module)

        const onAddPayloads: any[] = []
        const onRemovePayloads: any[] = []
        listenerClient.on('addToStorageNode', (payload: any) => {
            onAddPayloads.push(payload)
        })
        listenerClient.on('removeFromStorageNode', (payload: any) => {
            onRemovePayloads.push(payload)
        })

        await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
        await stream.removeFromStorageNode(DOCKER_DEV_STORAGE_NODE)

        await until(() => {
            return onAddPayloads.find(({ streamId }) => streamId === stream.id)
                && onRemovePayloads.find(({ streamId }) => streamId === stream.id)
        })

        expect(onAddPayloads).toContainEqual({
            blockNumber: expect.any(Number),
            nodeAddress: DOCKER_DEV_STORAGE_NODE,
            streamId: stream.id,
        })
        expect(onRemovePayloads).toContainEqual({
            blockNumber: expect.any(Number),
            nodeAddress: DOCKER_DEV_STORAGE_NODE,
            streamId: stream.id,
        })
    }, TEST_TIMEOUT)

    it('getStoredStreams', async () => {
        const result = await listenerClient.getStoredStreams(DOCKER_DEV_STORAGE_NODE)
        expect(result.blockNumber).toBeGreaterThanOrEqual(0)
        expect(result.streams.length).toBeGreaterThanOrEqual(0)
        result.streams.forEach((s) => expect(s).toBeInstanceOf(Stream))
    }, TEST_TIMEOUT)
})
