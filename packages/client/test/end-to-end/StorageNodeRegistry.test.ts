import 'reflect-metadata'
import { Wallet } from 'ethers'
import { fetchPrivateKeyWithGas, randomEthereumAddress } from '@streamr/test-utils'
import { ConfigTest, DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { until } from '../../src/utils/promises'
import { createTestStream } from '../test-utils/utils'

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
            network: {
                entryPoints: [{
                    kademliaId: "entryPointBroker",
                    type: 0,
                    websocket: {
                        ip: "127.0.0.1",
                        port: 40401
                    }
                }],
                peerDescriptor: {
                    kademliaId: "storage-node-registry-1-creator",
                    type: 0,
                    websocket: {
                        ip: 'localhost',
                        port: 43235
                    }
                }
            }
        })
        listenerClient = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: listenerWallet.privateKey,
            },
            network: {
                entryPoints: [{
                    kademliaId: "entryPointBroker",
                    type: 0,
                    websocket: {
                        ip: "127.0.0.1",
                        port: 40401
                    }
                }],
                peerDescriptor: {
                    kademliaId: "storage-node-registry-1-listener",
                    type: 0,
                    websocket: {
                        ip: 'localhost',
                        port: 43234
                    }
                }
            }
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
        expect(storageNodes[0]).toStrictEqual(DOCKER_DEV_STORAGE_NODE)
        let stored = await creatorClient.getStoredStreams(DOCKER_DEV_STORAGE_NODE)
        expect(stored.streams.some((s) => s.id === stream.id)).toBe(true)

        await stream.removeFromStorageNode(DOCKER_DEV_STORAGE_NODE)
        await until(async () => { return !(await creatorClient.isStoredStream(stream.id, DOCKER_DEV_STORAGE_NODE)) }, 100000, 1000)
        storageNodes = await stream.getStorageNodes()
        expect(storageNodes).toHaveLength(0)
        stored = await creatorClient.getStoredStreams(DOCKER_DEV_STORAGE_NODE)
        expect(stored.streams.some((s) => s.id === stream.id)).toBe(false)
        expect(stored.streams.length).toBeGreaterThanOrEqual(0)
        stored.streams.forEach((s) => expect(s).toBeInstanceOf(Stream))
    }, TEST_TIMEOUT * 2)

    it('no storage node', async () => {
        const id = randomEthereumAddress()
        const stored = await creatorClient.getStoredStreams(id)
        expect(stored.streams).toEqual([])
        expect(stored.blockNumber).toBeNumber()
    }, TEST_TIMEOUT)

    it('no assignments', async () => {
        const storageNodeWallet = new Wallet(await fetchPrivateKeyWithGas())
        const storageNodeManager = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: storageNodeWallet.privateKey
            },
            network: {
                ...ConfigTest.network,
                id: storageNodeWallet.address
            }
        })
        await storageNodeManager.setStorageNodeMetadata({ http: 'mock-url' })
        const stored = await creatorClient.getStoredStreams(storageNodeWallet.address)
        expect(stored.streams).toEqual([])
        expect(stored.blockNumber).toBeNumber()
        await storageNodeManager.destroy()
    }, TEST_TIMEOUT * 2)

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
    }, TEST_TIMEOUT * 2)
})
