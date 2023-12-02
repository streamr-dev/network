#!/usr/bin/env node
import { config as CHAIN_CONFIG } from '@streamr/config'
import { DhtNode, NodeType } from '@streamr/dht'
import { hexToBinary } from '@streamr/utils'

const main = async () => {
    const entryPoint = CHAIN_CONFIG.dev2.entryPoints![0]
    const peerDescriptor = {
        ...entryPoint,
        nodeId: hexToBinary(entryPoint.nodeId),
        type: NodeType.NODEJS  // TODO remove this when NET-1070 done
    }
    const dhtNode = new DhtNode({
        peerId: entryPoint.nodeId,
        websocketHost: entryPoint.websocket!.host,
        websocketPortRange: {
            min: entryPoint.websocket!.port,
            max: entryPoint.websocket!.port
        },
        websocketServerEnableTls: false,
        entryPoints: [peerDescriptor]
    })
    await dhtNode.start()
    await dhtNode.joinDht([peerDescriptor])
    console.info('Entry point started')
}

main()
