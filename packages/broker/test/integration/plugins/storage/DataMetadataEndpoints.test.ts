import http from 'http'
import { Tracker } from 'streamr-network'
import { Wallet } from 'ethers'
import StreamrClient, { ConfigTest, Stream } from 'streamr-client'
import {
    startBroker,
    createClient,
    waitForStreamPersistedInStorageNode,
    createTestStream,
    getPrivateKey,
    startTestTracker
} from '../../../utils'
import { Broker } from "../../../../src/broker"

jest.setTimeout(30000)
const httpPort1 = 12371
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
    let storageNodeAccount: Wallet

    beforeAll(async () => {
        storageNodeAccount = new Wallet(await getPrivateKey())
        tracker = await startTestTracker(trackerPort)
        const storageNodeClient = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: storageNodeAccount.privateKey
            },
        })
        await storageNodeClient.createOrUpdateNodeInStorageNodeRegistry(`{"http": "http://127.0.0.1:${httpPort1}/api/v1"}`)
        storageNode = await startBroker({
            name: 'storageNode',
            privateKey: storageNodeAccount.privateKey,
            trackerPort,
            httpPort: httpPort1,
            enableCassandra: true,
        })
        client1 = await createClient(tracker, await getPrivateKey())
    })

    afterAll(async () => {
        await Promise.allSettled([
            tracker?.stop(),
            client1?.destroy(),
            storageNode?.stop()
        ])
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
        await freshStream.addToStorageNode(storageNodeAccount.address)
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
