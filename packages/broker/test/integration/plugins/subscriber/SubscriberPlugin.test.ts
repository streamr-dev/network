import { Tracker } from '@streamr/network-tracker'
import { createClient, startTestTracker } from '../../../utils'
import { Wallet } from 'ethers'
import { SubscriberPlugin } from '../../../../src/plugins/subscriber/SubscriberPlugin'
import StreamrClient from 'streamr-client'

const TRACKER_PORT = 12465
const wallet = Wallet.createRandom()

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
        expect(await plugin.streamrClient.getSubscriptions('stream-0')).toBeArrayOfSize(2)
        expect(await plugin.streamrClient.getSubscriptions('stream-1')).toBeArrayOfSize(1)
    })
})
