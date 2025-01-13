import { StreamrClient } from '../../src/StreamrClient'

describe('start node', () => {
    it('start without websocket', async () => {
        const client = new StreamrClient({
            environment: 'dev2',
            network: {
                controlLayer: {
                    websocketPortRange: null
                }
            }
        })
        const node = client.getNode()
        expect((await node.getPeerDescriptor()).websocket).toBeUndefined()
    })
})
