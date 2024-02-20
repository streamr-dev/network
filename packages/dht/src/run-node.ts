import { DhtNode, NodeType, PeerDescriptor } from "./exports"
import { hexToBinary } from '@streamr/utils'

const main = async () => {
    const ep: PeerDescriptor = {
        nodeId: hexToBinary('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'),
        type: NodeType.NODEJS,
        websocket: {
            host: '65.108.158.160',
            port: 30000,
            tls: false
        }

    }
    const node = new DhtNode({
        entryPoints: [ep]
    })
    await node.start()
    await node.joinDht([ep])
}

main()