import { Tracker } from '@streamr/network-tracker'
import { createClient, startTestTracker } from '../../../utils'
import { SubscriberPlugin } from '../../../../src/plugins/subscriber/SubscriberPlugin'
import StreamrClient from 'streamr-client'
import { fastWallet } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'

const TRACKER_PORT = 12465
const wallet = fastWallet()

const createMockPlugin = async (streamrClient: StreamrClient) => {
    const brokerConfig: any = {
        client: {
            auth: {
                privateKey: wallet.privateKey
            }
        },
        plugins: {
            subscriber: {
                streams: [
                    {
                        streamId: "stream-0",
                        streamPartition: 0
                    },
                    {
                        streamId: "stream-0",
                        streamPartition: 1
                    },
                    {
                        streamId: "stream-1",
                        streamPartition: 0
                    }
                ]
            }
        }
    }
    return new SubscriberPlugin({
        name: 'subscriber',
        streamrClient,
        apiAuthenticator: undefined as any,
        brokerConfig
    })
}

describe('Subscriber Plugin', () => {
    let tracker: Tracker
    let client: StreamrClient
    let plugin: any

    beforeAll(async () => {
        tracker = await startTestTracker(TRACKER_PORT)
        client = await createClient(tracker, wallet.privateKey)
        plugin = await createMockPlugin(client)
        await plugin.start()
    })

    afterAll(async () => {
        await Promise.allSettled([
            client?.destroy(),
            plugin?.stop(),
            tracker?.stop(),
        ])
    })

    it('subscribes to the configured list of streams', async () => {
        const node = (await client.getNode())
        await waitForCondition(() => {
            const streams = node.getStreamParts().map((stream) => stream.toString())
            return streams.includes("stream-0#0")
                && streams.includes("stream-0#1")
                && streams.includes("stream-1#0")
        })
        // If waitForCondition succeeds we are okay
        expect(true).toEqual(true)
    })
})
