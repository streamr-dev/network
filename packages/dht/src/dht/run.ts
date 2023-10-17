import { DhtNode } from './DhtNode'
import { hexToBinary } from '@streamr/utils'
import { NodeType } from '../proto/packages/dht/protos/DhtRpc'

const main = async () => {
    const node = new DhtNode({
        websocketPortRange: { min: 30000, max: 30000 },
        websocketServerEnableTls: true,
        entryPoints: [{
                kademliaId: hexToBinary('e1'),
                type: NodeType.NODEJS,
                websocket: {
                    host: 'entrypoint-1.streamr.network',
                    port: 40401,
                    tls: true
                }
            },
            {
                kademliaId: hexToBinary('e2'),
                type: NodeType.NODEJS,
                websocket: {
                    host: 'entrypoint-2.streamr.network',
                    port: 40401,
                    tls: true
                }
            }
        ]
    })
    await node.start()
}

main()
