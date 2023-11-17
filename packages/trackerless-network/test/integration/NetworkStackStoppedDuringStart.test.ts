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
                entryPoints: [epDescriptor],
                websocketServerEnableTls: false
            }
        })
        node = new NetworkStack({
            layer0: {
                peerDescriptor: createMockPeerDescriptor(),
                entryPoints: [epDescriptor],
                websocketServerEnableTls: false
            }
        })
        await entryPoint.start()
    })
    
    afterEach(async () => {
        await entryPoint.stop()
    })

    it('Can be stopped during start', async () => {
        setImmediate(() => node.stop())
        await node.start()
    })

})
