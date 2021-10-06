import http from 'http'
import { startTracker, Tracker } from 'streamr-network'
import { Wallet } from 'ethers'
import StreamrClient, { Stream } from 'streamr-client'
import { startBroker, createClient, StorageAssignmentEventManager, waitForStreamPersistedInStorageNode, createTestStream } from '../../../utils'
import { Broker } from "../../../../src/broker"

jest.setTimeout(30000)
const httpPort1 = 12371
const wsPort1 = 12372
const trackerPort = 12375

const httpGet = (url: string): Promise<[number, string]> => { // return tuple is of form [statusCode, body]
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            res.setEncoding('utf8')
            let body = ''
            res.on('data', (chunk) => {
                body += chunk
            })
            res.on('end', () => resolve([res.statusCode ?? -1, body]))
        }).on('error', reject)
    })
}

describe('DataMetadataEndpoints', () => {
    let tracker: Tracker
    let storageNode: Broker
    let client1: StreamrClient
    const storageNodeAccount = new Wallet('0x2cd9855d17e01ce041953829398af7e48b24ece04ff9d0e183414de54dc52285')
    let assignmentEventManager: StorageAssignmentEventManager

    beforeAll(async () => {

        const storageNodeRegistry = {
            contractAddress: storageNodeAccount.address,
            jsonRpcProvider: `http://127.0.0.1:${httpPort1}`
        }
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker-DataMetadataEndpoints'
        })
        const engineAndEditorAccount = new Wallet('0x5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0')
        const trackerInfo = tracker.getConfigRecord()
        const storageNodeClient = new StreamrClient({
            auth: {
                privateKey: storageNodeAccount.privateKey
            },
        })
        await storageNodeClient.setNode('http://127.0.0.1:' + httpPort1)
        storageNode = await startBroker({
            name: 'storageNode',
            privateKey: storageNodeAccount.privateKey,
            trackerPort,
            trackerId: trackerInfo.id,
            httpPort: httpPort1,
            wsPort: wsPort1,
            enableCassandra: true,
            streamrAddress: engineAndEditorAccount.address,
            trackers: [trackerInfo],
            storageNodeConfig: { registry: storageNodeRegistry }
        })
        client1 = createClient(tracker, '0x4059de411f15511a85ce332e7a428f36492ab4e87c7830099dadbf130f1896ae', {
            storageNodeRegistry: storageNodeRegistry,
        })
        assignmentEventManager = new StorageAssignmentEventManager(tracker, engineAndEditorAccount)
        await assignmentEventManager.createStream()
    })

    afterAll(async () => {
        await tracker.stop()
        await client1.destroy()
        await storageNode.stop()
        await assignmentEventManager.close()
    })

    it('returns http error 400 if given non-numeric partition', async () => {
        const url = `http://localhost:${httpPort1}/api/v1/streams/stream/metadata/partitions/non-numeric`
        const [status, json] = await httpGet(url)
        const res = JSON.parse(json)

        expect(status).toEqual(400)
        expect(res).toEqual({
            error: 'Path parameter "partition" not a number: non-numeric'
        })
    })

    it('returns zero values for non-existing stream', async () => {
        const url = `http://localhost:${httpPort1}/api/v1/streams/non-existing-stream/metadata/partitions/0`
        const [status, json] = await httpGet(url)
        const res = JSON.parse(json)

        expect(status).toEqual(200)
        expect(res.totalBytes).toEqual(0)
        expect(res.totalMessages).toEqual(0)
        expect(res.firstMessage).toEqual(0)
        expect(res.lastMessage).toEqual(0)
    })

    async function setUpStream(): Promise<Stream> {
        const freshStream = await createTestStream(client1, module)
        await assignmentEventManager.addStreamToStorageNode(freshStream.id, storageNodeAccount.address, client1)
        await waitForStreamPersistedInStorageNode(freshStream.id, 0, '127.0.0.1', httpPort1)
        return freshStream
    }

    it('returns (non-zero) metadata for existing stream', async () => {
        const stream = await setUpStream()
        await client1.publish(stream.id, {
            key: 1
        })
        await client1.publish(stream.id, {
            key: 2
        })
        await client1.publish(stream.id, {
            key: 3
        })
        const lastItem = await client1.publish(stream.id, {
            key: 4
        })
        await client1.waitForStorage(lastItem)

        const url = `http://localhost:${httpPort1}/api/v1/streams/${encodeURIComponent(stream.id)}/metadata/partitions/0`
        const [status, json] = await httpGet(url)
        const res = JSON.parse(json)

        expect(status).toEqual(200)
        expect(res.totalBytes).toEqual(1443)
        expect(res.totalMessages).toEqual(4)
        expect(
            new Date(res.firstMessage).getTime()
        ).toBeLessThan(
            new Date(res.lastMessage).getTime()
        )
    })
})
