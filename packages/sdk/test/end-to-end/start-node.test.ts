import { CONFIG_TEST } from '../../src/ConfigTest'
import { StreamrClient } from '../../src/StreamrClient'

describe('start node', () => {

    it('start without websocket', async () => {
        const client = new StreamrClient({
            ...CONFIG_TEST,
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
