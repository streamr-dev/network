import http from 'http'
import { Wallet } from 'ethers'
import { StreamrClient, Stream } from '@streamr/sdk'
import { createClient, createTestStream, startStorageNode } from '../../../utils'
import { Broker } from '../../../../src/broker'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { toEthereumAddress } from '@streamr/utils'

const httpPort1 = 12371

const TIMEOUT = 30 * 1000

const httpGet = (url: string): Promise<[number, string]> => {
    // return tuple is of form [statusCode, body]
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

describe('dataMetadataEndpoints', () => {
    let storageNode: Broker
    let client1: StreamrClient
    let storageNodeAccount: Wallet

    beforeAll(async () => {
        storageNodeAccount = new Wallet(await fetchPrivateKeyWithGas())
        client1 = createClient(await fetchPrivateKeyWithGas())
        storageNode = await startStorageNode(storageNodeAccount.privateKey, httpPort1)
    }, TIMEOUT)

    afterAll(async () => {
        await Promise.allSettled([client1.destroy(), storageNode.stop()])
    }, TIMEOUT)

    it(
        'returns http error 400 if given non-numeric partition',
        async () => {
            const url = `http://127.0.0.1:${httpPort1}/streams/stream/metadata/partitions/non-numeric`
            const [status, json] = await httpGet(url)
            const res = JSON.parse(json)

            expect(status).toEqual(400)
            expect(res).toEqual({
                error: 'Path parameter "partition" not a number: non-numeric'
            })
        },
        TIMEOUT
    )

    it(
        'returns zero values for non-existing stream',
        async () => {
            const url = `http://127.0.0.1:${httpPort1}/streams/non-existing-stream/metadata/partitions/0`
            const [status, json] = await httpGet(url)
            const res = JSON.parse(json)

            expect(status).toEqual(200)
            expect(res.totalBytes).toEqual(0)
            expect(res.totalMessages).toEqual(0)
            expect(res.firstMessage).toEqual(0)
            expect(res.lastMessage).toEqual(0)
        },
        TIMEOUT
    )

    async function setUpStream(): Promise<Stream> {
        const freshStream = await createTestStream(client1, module)
        await freshStream.addToStorageNode(toEthereumAddress(storageNodeAccount.address), { wait: true })
        return freshStream
    }

    it(
        'returns (non-zero) metadata for existing stream',
        async () => {
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

            const url = `http://127.0.0.1:${httpPort1}/streams/${encodeURIComponent(stream.id)}/metadata/partitions/0`
            const [status, json] = await httpGet(url)
            const res = JSON.parse(json)

            expect(status).toEqual(200)
            expect(res.totalMessages).toEqual(4)
            // 282 is the lower bound of the size of a single messages, the size will be non-deterministic
            // due to the possibility of sequence number being != 0
            expect(res.totalBytes).toBeGreaterThan(4 * 282)
            expect(new Date(res.firstMessage).getTime()).toBeLessThan(new Date(res.lastMessage).getTime())
        },
        TIMEOUT
    )
})
