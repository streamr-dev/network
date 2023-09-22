#!/usr/bin/env node
//import { config as CHAIN_CONFIG } from '@streamr/config'
import { DhtNode, NodeType } from '@streamr/dht'
import { hexToBinary } from '@streamr/utils'
import omit from 'lodash/omit'

const main = async () => {
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
    const host = process.argv[2] ?? tmp[0].websocket.host

    const peerDescriptor = tmp.map((entryPoint) => {
        return {
            ...omit(entryPoint, 'id'),
            kademliaId: hexToBinary(entryPoint.id),
            type: NodeType.NODEJS,  // TODO remove this when NET-1070 done
            websocket: {
                ...entryPoint.websocket,
                host
            },
        }
    })[0]
    // eslint-disable-next-line no-console
    console.log('DEBUG: ' + JSON.stringify(peerDescriptor))
    const dhtNode = new DhtNode({
        websocketHost: host,
        websocketPortRange: { min: 40500, max: 40500 },
        entryPoints: [peerDescriptor]
    })
    await dhtNode.start()
    await dhtNode.joinDht([peerDescriptor])
    console.info('Entry point started')
    console.info(dhtNode.getPeerDescriptor())
}

main()
