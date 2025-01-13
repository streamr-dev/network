import { createClient } from '../../../utils'
import { SubscriberPlugin } from '../../../../src/plugins/subscriber/SubscriberPlugin'
import { StreamrClient } from '@streamr/sdk'
import { fastWallet } from '@streamr/test-utils'
import { until } from '@streamr/utils'

const wallet = fastWallet()

const createMockPlugin = async () => {
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
                        streamId: 'stream-0',
                        streamPartition: 0
                    },
                    {
                        streamId: 'stream-0',
                        streamPartition: 1
                    },
                    {
                        streamId: 'stream-1',
                        streamPartition: 0
                    }
                ]
            }
        }
    }
    return new SubscriberPlugin('subscriber', brokerConfig)
}

describe('Subscriber Plugin', () => {
    let client: StreamrClient
    let plugin: any

    beforeAll(async () => {
        client = createClient(wallet.privateKey)
        plugin = await createMockPlugin()
        await plugin.start(client)
    })

    afterAll(async () => {
        await Promise.allSettled([client.destroy(), plugin.stop()])
    })

    it('subscribes to the configured list of streams', async () => {
        const node = client.getNode()
        await until(async () => {
            const streams = (await node.getStreamParts()).map((stream) => stream.toString())
            return streams.includes('stream-0#0') && streams.includes('stream-0#1') && streams.includes('stream-1#0')
        })
        // If until succeeds we are okay
        expect(true).toEqual(true)
    })
})
