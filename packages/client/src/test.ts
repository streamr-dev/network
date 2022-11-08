/* eslint-disable */
import { range, padStart } from 'lodash'
import { StreamrClient } from './StreamrClient'
import { ConfigTest } from './ConfigTest'

const createPrivateKey = (i: number): string => {
    return `0x${padStart(String(i + 1), 64, '0')}`
}

const main = async () => {

    const STORAGE_NODES = 250

    const mainClient = new StreamrClient({
        ...ConfigTest,
        auth: {
            privateKey: createPrivateKey(1)
        }
    })

    console.log('Create stream')
    const stream = await mainClient.createStream('/test/' + Date.now())
    console.log('Stream: ' + stream.id)

    for await (const i of range(STORAGE_NODES)) {
        console.log('Create node ' + i)
        const client = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: createPrivateKey(i + 100)
            }
        })
        await client.setStorageNodeMetadata({
            http: 'mock-http'
        })
        if (i % 2 === 0) {
            await mainClient.addStreamToStorageNode(stream.id, await client.getAddress())
        }
    }

    const streamNodes = await mainClient.getStorageNodes(stream.id)
    console.log(streamNodes.length)
    const allNodes = await mainClient.getStorageNodes()
    console.log(allNodes.length)
    try {
        const none = await mainClient.getStorageNodes('0x2b5ad5c4795c026514f8317c7a215e218dccd6cf/non-existent')
        console.log(none.length)
    } catch (e) {
        console.log(e.constructor.name)
        console.log(e.message)
    }
}

main()
