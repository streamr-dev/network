import { DhtNode } from './DhtNode'
import { hexToBinary } from '@streamr/utils'
import { NodeType } from '../proto/packages/dht/protos/DhtRpc'

const main = async () => {
    const node = new DhtNode({
        websocketPortRange: { min: 30000, max: 30000 },
        websocketServerEnableTls: true,
        entryPoints: [{
            kademliaId: hexToBinary('e2'),
            websocket: {
                host: '65.108.158.160',
                port: 30000,
                tls: false
            },
            type: NodeType.NODEJS,
        }]
    })
    await node.start()
}

main()
