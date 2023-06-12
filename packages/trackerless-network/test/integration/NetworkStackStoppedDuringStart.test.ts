import { PeerID } from "@streamr/dht"
import { NetworkStack } from "../../src/NetworkStack"
import { NodeType } from "../../src/proto/packages/dht/protos/DhtRpc"

describe('NetworkStack can be stopped during start', () => {
    
    const epDescriptor = {
        kademliaId: PeerID.fromString('entrypoint').value,
        type: NodeType.NODEJS,
        websocket: { ip: 'localhost', port: 32224 },
    }
    let entryPoint: NetworkStack
    let peer: NetworkStack

    beforeEach(async () => {
        entryPoint = new NetworkStack({
            layer0: {
                peerDescriptor: epDescriptor,
                entryPoints: [epDescriptor]
            },
            networkNode: {}
        })
        peer = new NetworkStack({
            layer0: {
                peerDescriptor: {
                    kademliaId: PeerID.fromString('peer').value,
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
        setImmediate(() => peer.stop())
        await peer.start()
    })

})
