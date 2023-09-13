import { hexToBinary } from '@streamr/utils'
import { NetworkStack } from '../../src/NetworkStack'
import { createRandomNodeId } from '../utils/utils'

describe('NetworkStack can be stopped during start', () => {
    
    const epDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        websocket: { ip: 'localhost', port: 32224 },
    }
    let entryPoint: NetworkStack
    let node: NetworkStack

    beforeEach(async () => {
        entryPoint = new NetworkStack({
            layer0: {
                peerDescriptor: epDescriptor,
                entryPoints: [epDescriptor]
            },
            networkNode: {}
        })
        node = new NetworkStack({
            layer0: {
                peerDescriptor: {
                    kademliaId: hexToBinary(createRandomNodeId()),
                },
                entryPoints: [epDescriptor]
            },
            networkNode: {}
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
