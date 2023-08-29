import { PeerID } from '@streamr/dht'
import { NetworkStack } from '../../src/NetworkStack'
import { NodeType } from '../../src/proto/packages/dht/protos/DhtRpc'

describe('NetworkStack can be stopped during start', () => {
    
    const epDescriptor = {
        kademliaId: PeerID.fromString('entrypoint').value,
        type: NodeType.NODEJS,
        websocket: { ip: 'localhost', port: 32224 },
        nodeName: 'entrypoint'
    }
    let entryPoint: NetworkStack
    let peer: NetworkStack

    beforeEach(async () => {
        entryPoint = new NetworkStack({
            layer0: {
                peerDescriptor: epDescriptor,
                entryPoints: [epDescriptor],
                nodeName: 'entrypoint',
            },
           
            networkNode: {}
        })
        peer = new NetworkStack({
            layer0: {
                peerDescriptor: {
                    kademliaId: PeerID.fromString('peer').value,
                    type: NodeType.NODEJS, 
                    nodeName: 'peer'
                },
                nodeName: 'peer',
                entryPoints: [epDescriptor],
            },
            networkNode: {}
        })
        await entryPoint.start()
    })
    
    afterEach(async () => {
        await entryPoint.stop()
    })

    it('Can be stopped during start', (done) => {
        let readyCounter = 0
        const onReady = () => {
            readyCounter++
            if (readyCounter === 2) {
                done()
            }
        }

        setImmediate(async () => {
            await peer.stop()
            onReady()
        })
        peer.start().then(() => onReady()).catch(() => done())
    })

})
