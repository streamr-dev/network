#!/usr/bin/env node
import { DhtNode, NodeType } from '@streamr/dht'
import { hexToBinary } from '@streamr/utils'
import { CONFIG_TEST } from 'streamr-client'
import omit from 'lodash/omit'

const main = async () => {
    const entryPoint = CONFIG_TEST.network!.controlLayer!.entryPoints![0]
    const peerDescriptor = {
        ...omit(entryPoint, 'nodeId'),
        nodeId: hexToBinary(entryPoint.nodeId),
        type: NodeType.NODEJS,  // TODO remove this when NET-1070 done
        websocket: {
            ...entryPoint.websocket!,
        }
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
