#!/usr/bin/env node
import { DhtNode, PeerID } from '@streamr/dht'

const main = async () => {
    const peerDescriptor = {
        kademliaId: PeerID.fromString('entrypoint').value,
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
