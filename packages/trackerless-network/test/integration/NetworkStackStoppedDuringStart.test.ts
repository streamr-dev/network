import { hexToBinary } from '@streamr/utils'
import { NetworkStack } from '../../src/NetworkStack'
import { NodeType } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createRandomNodeId } from '../utils/utils'

describe('NetworkStack can be stopped during start', () => {
    
    const epDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS,
        websocket: { host: 'localhost', port: 32224, tls: false },
    }
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
                peerDescriptor: {
                    kademliaId: hexToBinary(createRandomNodeId()),
                    type: NodeType.NODEJS
                },
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
        await node.start()
    })

})
