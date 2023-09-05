import { PeerID } from '@streamr/dht'
import { NetworkStack } from '../../src/NetworkStack'
import { NodeType } from '../../src/proto/packages/dht/protos/DhtRpc'

describe('NetworkStack can be stopped during start', () => {
    
    const epDescriptor = {
        kademliaId: PeerID.fromString('entrypoint').value,
        type: NodeType.NODEJS,
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
                    kademliaId: PeerID.fromString('node').value,
                    type: NodeType.NODEJS
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
