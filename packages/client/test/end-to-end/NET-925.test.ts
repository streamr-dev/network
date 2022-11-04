import { Logger, wait } from '@streamr/utils'
import { Wallet } from 'ethers'
import { padStart, range } from 'lodash'
import { fetchPrivateKeyWithGas } from 'streamr-test-utils'
import { ConfigTest, DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { collect } from '../../src/utils/iterators'

const STREAM_COUNT = 1100

const logger = new Logger(module)

const assertSameStreams = (s1: Stream[], s2: Stream[]) => {
    expect(s1.map((s) => s.id).sort()).toEqual(s2.map((s) => s.id).sort())
}

const getPrivateKey = (i: number) => {
    const OFFSET = 100
    return `${padStart(String(i + OFFSET), 64, '0')}`
}

describe.skip('NET-925', () => { // TODO do not merge this to main

    const clients: StreamrClient[] = []
    const streams: Stream[] = []

    beforeAll(async () => {
        logger.info('Create clients and streams')
        const CHUNK_COUNT = 20
        await Promise.all(range(CHUNK_COUNT).map(async (i) => {
            const wallet = new Wallet(getPrivateKey(i))
            const client = new StreamrClient({
                ...ConfigTest,
                auth: {
                    privateKey: wallet.privateKey,
                }
            })
            clients.push(client)
            for (const j of range(STREAM_COUNT / CHUNK_COUNT)) {
                const stream = await client.getOrCreateStream({
                    id: `/net-925/${i}/${j}` 
                })
                streams.push(stream)
                await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE, {
                    timeout: -1
                })
                logger.info(`Ready: ${stream.id}`)
            }
        }))
        logger.info('Wait for The Graph to index')
        await wait(30 * 1000)
    }, 10 * 60 * 1000)

    afterAll(async () => {
        logger.info('Destroy clients')
        await Promise.all(clients.map((c) => c.destroy()))
    }, 60 * 1000)

    it('happy path', async () => {
        const queryClient = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: new Wallet(await fetchPrivateKeyWithGas()).privateKey,
            }
        })
        logger.info('Search streams')
        const searched = await collect(queryClient.searchStreams('/net-925', undefined))
        assertSameStreams(searched, streams)
        logger.info('Get stored streams')
        const stored = (await queryClient.getStoredStreams(DOCKER_DEV_STORAGE_NODE)).streams
        assertSameStreams(stored, streams)
        await queryClient.destroy()
    }, 10 * 60 * 1000)
})
