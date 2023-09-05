#!/usr/bin/env node
import { DhtNode, NodeType, PeerID, PeerIDKey } from '@streamr/dht'

const main = async () => {
    const peerDescriptor = {
        kademliaId: PeerID.fromKey('eeeeeeeeee' as PeerIDKey).value,
        type: NodeType.NODEJS,
        websocket: {
            ip: '127.0.0.1',
            port: 40500
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
