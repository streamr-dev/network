#!/usr/bin/env node
//import { config as CHAIN_CONFIG } from '@streamr/config'
import { DhtNode, NodeType } from '@streamr/dht'
import { hexToBinary } from '@streamr/utils'
import omit from 'lodash/omit'

const main = async () => {
    const hostOverride = process.argv[2]
    const tmp = [ // TODO CHAIN_CONFIG.dev2.entryPoints
        {
            id: 'eeeeeeeeee',
            websocket: {
                host: '10.200.10.1',
                port: 40500,
                tls: false
            }
        }
    ]
    const peerDescriptor = tmp.map((entryPoint) => {
        return {
            ...omit(entryPoint, 'id'),
            kademliaId: hexToBinary(entryPoint.id),
            type: NodeType.NODEJS,  // TODO remove this when NET-1070 done
            websocket: {
                ...entryPoint.websocket,
                host: hostOverride ?? entryPoint.websocket!.host
            },
        }
    })[0]
    // eslint-disable-next-line no-console
    console.log('DEBUG: ' + JSON.stringify(peerDescriptor))
    const dhtNode = new DhtNode({
        peerId: tmp[0].id,
        websocketHost: tmp[0].websocket.host,
        websocketPortRange: {
            min: tmp[0].websocket.port,
            max: tmp[0].websocket.port
        },
        entryPoints: [peerDescriptor]
    })
    await dhtNode.start()
    await dhtNode.joinDht([peerDescriptor])
    console.info('Entry point started')
}

main()
