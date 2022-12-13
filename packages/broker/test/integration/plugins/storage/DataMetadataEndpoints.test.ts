import http from 'http'
import { Wallet } from 'ethers'
import StreamrClient, { Stream } from 'streamr-client'
import {
    createClient,
    createTestStream,
    startStorageNode
} from '../../../utils'
import { Broker } from "../../../../src/broker"
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { toEthereumAddress } from '@streamr/utils'

jest.setTimeout(60000)
const httpPort1 = 12371

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
    let storageNode: Broker
    let client1: StreamrClient
    let storageNodeAccount: Wallet
    let stream: Stream

    beforeAll(async () => {
        storageNodeAccount = new Wallet(await fetchPrivateKeyWithGas())
        const entryPoints = [{
            kademliaId: toEthereumAddress(await storageNodeAccount.getAddress()),
            type: 0,
            websocket: {
                ip: '127.0.0.1',
                port: 40412
            }
        }]

        client1 = await createClient(await fetchPrivateKeyWithGas(), {
            network: {
                layer0: {
                    peerDescriptor: {
                        kademliaId: 'DataMetadataEndpoints-client',
                        type: 0
                    },
                    entryPoints
                }
            }
        })

        stream = await createTestStream(client1, module)

        storageNode = await startStorageNode(
            storageNodeAccount.privateKey,
            httpPort1,
            40412,
            entryPoints,
            {
                subscriber: {
                    streams: [{
                        streamId: stream.id,
                        streamPartition: 0
                    }]
                }
            }
        )
    })

    afterAll(async () => {
        await Promise.allSettled([
            client1?.destroy(),
            storageNode?.stop()
        ])
    })

    it('returns http error 400 if given non-numeric partition', async () => {
        const url = `http://localhost:${httpPort1}/streams/stream/metadata/partitions/non-numeric`
        const [status, json] = await httpGet(url)
        const res = JSON.parse(json)

        expect(status).toEqual(400)
        expect(res).toEqual({
            error: 'Path parameter "partition" not a number: non-numeric'
        })
    })

    it('returns zero values for non-existing stream', async () => {
        const url = `http://localhost:${httpPort1}/streams/non-existing-stream/metadata/partitions/0`
        const [status, json] = await httpGet(url)
        const res = JSON.parse(json)

        expect(status).toEqual(200)
        expect(res.totalBytes).toEqual(0)
        expect(res.totalMessages).toEqual(0)
        expect(res.firstMessage).toEqual(0)
        expect(res.lastMessage).toEqual(0)
    })

    it('returns (non-zero) metadata for existing stream', async () => {
        await stream.addToStorageNode(toEthereumAddress(storageNodeAccount.address))

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

        const url = `http://localhost:${httpPort1}/streams/${encodeURIComponent(stream.id)}/metadata/partitions/0`
        const [status, json] = await httpGet(url)
        const res = JSON.parse(json)

        expect(status).toEqual(200)
        expect(res.totalBytes).toEqual(1775)
        expect(res.totalMessages).toEqual(4)
        expect(
            new Date(res.firstMessage).getTime()
        ).toBeLessThan(
            new Date(res.lastMessage).getTime()
        )
    }, 45000)
})
