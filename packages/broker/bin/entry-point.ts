#!/usr/bin/env node
import { DhtNode, NodeType } from '@streamr/dht'
import { hexToBinary } from '@streamr/utils'

const main = async () => {
    const peerDescriptor = {
        kademliaId: hexToBinary('eeeeeeeeee'),
        type: NodeType.NODEJS,
        websocket: {
            host: '127.0.0.1',
            port: 40500,
            tls: false
        }
    }
    const dhtNode = new DhtNode({
        peerDescriptor,
        entryPoints: [peerDescriptor]
    })
    await dhtNode.start()
    await dhtNode.joinDht([peerDescriptor])
    console.info('Entry point started')
}

main()
