#!/usr/bin/env node
import { config as CHAIN_CONFIG } from '@streamr/config'
import { DhtNode, NodeType } from '@streamr/dht'
import { hexToBinary } from '@streamr/utils'
import omit from 'lodash/omit'

const main = async () => {
    const peerDescriptor = CHAIN_CONFIG.dev2.entryPoints.map((entryPoint) => {
        return {
            kademliaId: hexToBinary(entryPoint.id),
            type: NodeType.NODEJS,  // TODO remove this when NET-1070 done
            ...omit(entryPoint, 'id')
        }
    })[0]
    const dhtNode = new DhtNode({
        peerDescriptor,
        entryPoints: [peerDescriptor]
    })
    await dhtNode.start()
    await dhtNode.joinDht([peerDescriptor])
    console.info('Entry point started')
}

main()
