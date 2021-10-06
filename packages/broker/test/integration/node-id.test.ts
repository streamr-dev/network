import { startTracker, Tracker } from 'streamr-network'
import { createClient, createTestStream } from '../utils'
import { StreamrClient, Stream, StreamOperation } from 'streamr-client'
import { Wallet } from 'ethers'
import { waitForCondition } from "streamr-test-utils"

const trackerPort = 12740

jest.setTimeout(30000)

describe('node id: with generateSessionId enabled', () => {
    let sharedWallet: Wallet
    let tracker: Tracker
    let client1: StreamrClient
    let client2: StreamrClient
    let stream: Stream

    beforeEach(async () => {
        sharedWallet = new Wallet('0x5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0')
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker-1'
        })

        client1 = createClient(tracker, sharedWallet.privateKey)
        client2 = createClient(tracker, sharedWallet.privateKey)

        stream = await createTestStream(client1, module)
        stream.grantPublicPermission(StreamOperation.STREAM_SUBSCRIBE)

        await Promise.all([
            client1.subscribe({
                streamId: stream.id,
                streamPartition: 0
            }),
            client2.subscribe({
                streamId: stream.id,
                streamPartition: 0
            })
        ])

    })

    afterEach(async () => {
        await Promise.all([
            tracker.stop(),
            client1.destroy(),
            client2.destroy()
        ])
    })

    it('two brokers with same privateKey are assigned separate node ids', async () => {
        await waitForCondition(() => tracker.getNodes().length === 2, 10000)
        const actual = tracker.getNodes()
        expect(actual[0]).not.toEqual(actual[1])
        expect(actual[0].startsWith(sharedWallet.address.toLowerCase())).toEqual(true)
        expect(actual[1].startsWith(sharedWallet.address.toLowerCase())).toEqual(true)
    })
})
