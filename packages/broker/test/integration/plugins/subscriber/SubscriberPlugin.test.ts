import { Tracker } from '@streamr/network-tracker'
import { createClient, startTestTracker } from '../../../utils'
import { SubscriberPlugin } from '../../../../src/plugins/subscriber/SubscriberPlugin'
import StreamrClient from 'streamr-client'
import { fastWallet } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'

const TRACKER_PORT = 12465
const wallet = fastWallet()

const createMockPlugin = async (abortSignal: AbortSignal, streamrClient: StreamrClient) => {
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
        brokerConfig,
        abortSignal
    })
}

describe('Subscriber Plugin', () => {
    let tracker: Tracker
    let client: StreamrClient
    let abortController: AbortController
    let plugin: any

    beforeAll(async () => {
        tracker = await startTestTracker(TRACKER_PORT)
        client = await createClient(tracker, wallet.privateKey)
        abortController = new AbortController()
        plugin = await createMockPlugin(abortController.signal, client)
        await plugin.start()
    })

    afterAll(async () => {
        abortController.abort()
        await Promise.allSettled([
            client?.destroy(),
            plugin?.stop(),
            tracker?.stop(),
        ])
    })

    it('subscribes to the configured list of streams', async () => {
        const nodeId = (await client.getNode()).getNodeId()
        await waitForCondition(() => {
            const overlays = tracker.getOverlayPerStreamPart() as any
            return (overlays["stream-0#0"]?.nodes[nodeId] !== undefined)
                && (overlays["stream-0#1"]?.nodes[nodeId] !== undefined)
                && (overlays["stream-1#0"]?.nodes[nodeId] !== undefined)
        })
        // If waitForCondition succeeds we are okay
        expect(true).toEqual(true)
    })
})
