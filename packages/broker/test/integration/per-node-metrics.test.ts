import StreamrClient, { ResendOptions, Stream, StreamOperation, StreamPartDefinition } from 'streamr-client'
import {startTracker, Tracker} from 'streamr-network'
import { Todo } from '../types'
import { startBroker, createClient, STREAMR_DOCKER_DEV_HOST, createTestStream } from '../utils'
import { Wallet } from 'ethers'
import { Broker } from '../broker'

const httpPort = 47741
const wsPort = 47742
const networkPort = 47743
const trackerPort = 47744

const fillMetrics = async (client: StreamrClient, count: number, nodeAddress: string, source: string) => {
    const sourceStream = nodeAddress + '/streamr/node/metrics/' + source
    const mockDate = new Date('2020-01-01').getTime()

    const promises = []

    for (let i = 0; i < count; i++) {
        const ts = mockDate + (i * 1000)

        const mockReport = {
            peerName: nodeAddress,
            peerId: nodeAddress,
            broker: {
                messagesToNetworkPerSec: 0,
                bytesToNetworkPerSec: 0,
                messagesFromNetworkPerSec: 0,
                bytesFromNetworkPerSec: 0,
            },
            network: {
                avgLatencyMs: 0,
                bytesToPeersPerSec: 0,
                bytesFromPeersPerSec: 0,
                connections: 0,
            },
            storage: {
                bytesWrittenPerSec: 0,
                bytesReadPerSec: 0,
            },

            startTime: 0,
            currentTime: ts,
            timestamp: ts
        }

        promises.push(client.publish(sourceStream, mockReport))
    }

    return Promise.allSettled(promises)
}



const waitForMessage = (
    stream: string,
    client: StreamrClient, 
): Promise<Todo> => {
    return new Promise((resolve, reject) => {
        try {
            client.subscribe({stream}, (res: Todo) => {
                resolve(res)
            })
        } catch (e){
            reject(e)
        }
    })
}

const expectMetrics = (res:any) => {
    expect(res.peerName).toEqual('storageNode')
    expect(res.broker.messagesToNetworkPerSec).toBeGreaterThan(0)
    expect(res.broker.bytesToNetworkPerSec).toBeGreaterThan(0)
    expect(res.broker.messagesFromNetworkPerSec).toBeGreaterThanOrEqual(0)
    expect(res.broker.bytesFromNetworkPerSec).toBeGreaterThanOrEqual(0)
    expect(res.network.avgLatencyMs).toBeGreaterThan(0)
    expect(res.network.bytesToPeersPerSec).toBeGreaterThanOrEqual(0)
    expect(res.network.bytesFromPeersPerSec).toBeGreaterThanOrEqual(0)
    expect(res.network.connections).toBeGreaterThanOrEqual(0)
    expect(res.storage.bytesWrittenPerSec).toBeGreaterThan(0)
    expect(res.storage.bytesReadPerSec).toBeGreaterThan(0)
    expect(res.startTime).toBeGreaterThan(0)
    expect(res.currentTime).toBeGreaterThan(0)
    expect(res.timestamp).toBeGreaterThan(0)   
}

describe('per-node metrics', () => {
    let tracker: Tracker
    let storageNode: Broker
    let client1: StreamrClient
    let legacyStream: Stream
    let nodeAddress: string
    let client2: StreamrClient

    beforeAll(async () => {
        const tmpAccount = Wallet.createRandom()
        const storageNodeAccount = Wallet.createRandom()
        const storageNodeRegistry = [{
            address: storageNodeAccount.address,
            url: `http://127.0.0.1:${httpPort}`
        }]
        
        nodeAddress = storageNodeAccount.address

        client1 = createClient(wsPort, tmpAccount.privateKey, {
            storageNode: storageNodeRegistry[0]
        })
        legacyStream = await createTestStream(client1, module)

        await legacyStream.grantPermission('stream_get' as StreamOperation, undefined)
        await legacyStream.grantPermission('stream_publish' as StreamOperation, storageNodeAccount.address)

        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })

        storageNode = await startBroker({
            name: 'storageNode', 
            privateKey: storageNodeAccount.privateKey,
            networkPort: networkPort,
            trackerPort,
            wsPort,
            httpPort,
            enableCassandra: true,
            reporting: {
                streamr: {
                    streamId: legacyStream.id
                },
                intervalInSeconds: 1,
                perNodeMetrics: {
                    enabled: true,
                    wsUrl: `ws://127.0.0.1:${wsPort}/api/v1/ws`,
                    httpUrl: `http://${STREAMR_DOCKER_DEV_HOST}/api/v1`,
                    intervals: {
                        sec: 1000,
                        min: 1000,
                        hour: 1000,
                        day: 1000
                    },
                    storageNode: storageNodeAccount.address
                }
            },
            storageNodeConfig: { registry: storageNodeRegistry },
            storageConfigRefreshInterval: 3000 // The streams are created deep inside `startBroker`,
            // therefore StorageAssignmentEventManager test helper cannot be used
        })

        client2 = createClient(wsPort, storageNodeAccount.privateKey)
        await Promise.all([
            fillMetrics(client2, 60, storageNodeAccount.address, 'sec'),
            fillMetrics(client2, 60, storageNodeAccount.address, 'min'),
            fillMetrics(client2, 24, storageNodeAccount.address, 'hour'),
        ])

    }, 35 * 1000)

    afterAll(async () => {
        await Promise.allSettled([
            tracker.stop(),
            storageNode.close(),
            client1.ensureDisconnected(),
            client2.ensureDisconnected()
        ])
    }, 30 * 1000)

    it('should ensure the legacy metrics endpoint still works properly', async () => {
        const res = await waitForMessage(legacyStream.id, client1)

        expect(res.peerId).toEqual('storageNode')
        expect(res.startTime).toBeGreaterThan(0)
        expect(res.currentTime).toBeGreaterThan(0)
        expect(res.metrics).toMatchObject({
            'WsEndpoint': expect.anything(),
            'WebRtcEndpoint': expect.anything(),
            'node': expect.anything(),
            'broker/publisher': expect.anything(),
            'broker/ws': expect.anything(),
            'broker/cassandra': expect.anything(),
            'broker/http': expect.anything(),
        })
    })

    it('should retrieve the last `sec` metrics', async () => {
        const res = await waitForMessage(nodeAddress + '/streamr/node/metrics/sec', client1)
        expectMetrics(res)
        /*
        expect(res.peerName).toEqual('storageNode')
        expect(res.broker.messagesToNetworkPerSec).toBeGreaterThan(0)
        expect(res.broker.bytesToNetworkPerSec).toBeGreaterThan(0)
        expect(res.broker.messagesFromNetworkPerSec).toBeGreaterThanOrEqual(0)
        expect(res.broker.bytesFromNetworkPerSec).toBeGreaterThanOrEqual(0)
        expect(res.network.avgLatencyMs).toBeGreaterThan(0)
        expect(res.network.bytesToPeersPerSec).toBeGreaterThanOrEqual(0)
        expect(res.network.bytesFromPeersPerSec).toBeGreaterThanOrEqual(0)
        expect(res.network.connections).toBeGreaterThanOrEqual(0)
        expect(res.storage.bytesWrittenPerSec).toBeGreaterThan(0)
        expect(res.storage.bytesReadPerSec).toBeGreaterThan(0)
        expect(res.startTime).toBeGreaterThan(0)
        expect(res.currentTime).toBeGreaterThan(0)
        expect(res.timestamp).toBeGreaterThan(0)   */
    })

    it('should retrieve the last `min` metrics', async () => {
        const res = await waitForMessage( nodeAddress + '/streamr/node/metrics/min', client1)

        expect(res.peerName).toEqual('storageNode')
        expect(res.broker.messagesToNetworkPerSec).toBeGreaterThan(0)
        expect(res.broker.bytesToNetworkPerSec).toBeGreaterThan(0)
        expect(res.broker.messagesFromNetworkPerSec).toBeGreaterThanOrEqual(0)
        expect(res.broker.bytesFromNetworkPerSec).toBeGreaterThanOrEqual(0)
        expect(res.network.avgLatencyMs).toBeGreaterThan(0)
        expect(res.network.bytesToPeersPerSec).toBeGreaterThanOrEqual(0)
        expect(res.network.bytesFromPeersPerSec).toBeGreaterThanOrEqual(0)
        expect(res.network.connections).toBeGreaterThanOrEqual(0)
        expect(res.storage.bytesWrittenPerSec).toBeGreaterThan(0)
        expect(res.storage.bytesReadPerSec).toBeGreaterThan(0)
        expect(res.startTime).toBeGreaterThanOrEqual(0)
        expect(res.currentTime).toBeGreaterThanOrEqual(0)
        expect(res.timestamp).toBeGreaterThanOrEqual(0)
            
    })

    it('should retrieve the last `hour` metrics', async () => {
        const res = await waitForMessage( nodeAddress + '/streamr/node/metrics/hour', client1)

        expect(res.peerName).toEqual('storageNode')
        expect(res.broker.messagesToNetworkPerSec).toBeGreaterThan(0)
        expect(res.broker.bytesToNetworkPerSec).toBeGreaterThan(0)
        expect(res.broker.messagesFromNetworkPerSec).toBeGreaterThanOrEqual(0)
        expect(res.broker.bytesFromNetworkPerSec).toBeGreaterThanOrEqual(0)
        expect(res.network.avgLatencyMs).toBeGreaterThan(0)
        expect(res.network.bytesToPeersPerSec).toBeGreaterThanOrEqual(0)
        expect(res.network.bytesFromPeersPerSec).toBeGreaterThanOrEqual(0)
        expect(res.network.connections).toBeGreaterThanOrEqual(0)
        expect(res.storage.bytesWrittenPerSec).toBeGreaterThan(0)
        expect(res.storage.bytesReadPerSec).toBeGreaterThan(0)
        expect(res.startTime).toBeGreaterThanOrEqual(0)
        expect(res.currentTime).toBeGreaterThanOrEqual(0)
        expect(res.timestamp).toBeGreaterThanOrEqual(0)
            
    })

    it('should retrieve the last `day` metrics', async () => {
        const res = await waitForMessage( nodeAddress + '/streamr/node/metrics/day', client1)

        expect(res.peerName).toEqual('storageNode')
        expect(res.broker.messagesToNetworkPerSec).toBeGreaterThan(0)
        expect(res.broker.bytesToNetworkPerSec).toBeGreaterThan(0)
        expect(res.broker.messagesFromNetworkPerSec).toBeGreaterThanOrEqual(0)
        expect(res.broker.bytesFromNetworkPerSec).toBeGreaterThanOrEqual(0)
        expect(res.network.avgLatencyMs).toBeGreaterThan(0)
        expect(res.network.bytesToPeersPerSec).toBeGreaterThanOrEqual(0)
        expect(res.network.bytesFromPeersPerSec).toBeGreaterThanOrEqual(0)
        expect(res.network.connections).toBeGreaterThanOrEqual(0)
        expect(res.storage.bytesWrittenPerSec).toBeGreaterThan(0)
        expect(res.storage.bytesReadPerSec).toBeGreaterThan(0)
        expect(res.startTime).toBeGreaterThanOrEqual(0)
        expect(res.currentTime).toBeGreaterThanOrEqual(0)
        expect(res.timestamp).toBeGreaterThanOrEqual(0)
            
    })
})
