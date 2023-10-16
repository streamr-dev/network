import { NetworkStack } from '../../src/NetworkStack'
import { createMockPeerDescriptor } from '../utils/utils'

describe('NetworkStack can be stopped during start', () => {
    
    const epDescriptor = createMockPeerDescriptor({
        websocket: { host: '127.0.0.1', port: 32224, tls: false },
    })
    let entryPoint: NetworkStack
    let node: NetworkStack

    beforeEach(async () => {
        entryPoint = new NetworkStack({
            layer0: {
                peerDescriptor: epDescriptor,
                entryPoints: [epDescriptor]
            }
        })
        node = new NetworkStack({
            layer0: {
                peerDescriptor: createMockPeerDescriptor(),
                entryPoints: [epDescriptor]
            }
        })
        await entryPoint.start()
    })
    
    afterEach(async () => {
        await entryPoint.stop()
    })

    it('Can be stopped during start', async () => {
        setImmediate(() => node.stop())
        // we throw as calling stop while start is running is not valid way to use the API
        await expect(node.start()).rejects.toThrow('aborted')
    })

})
