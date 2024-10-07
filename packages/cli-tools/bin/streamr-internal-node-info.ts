#!/usr/bin/env node
import { DhtNode, PeerDescriptor, toDhtAddress, toNodeId } from '@streamr/dht'
import StreamrClient, { DhtAddress } from '@streamr/sdk'
import { ContentDeliveryLayerNeighborInfo, NetworkNode, NodeInfo, StreamPartitionInfo } from '@streamr/trackerless-network'
import { binaryToHex, Logger } from '@streamr/utils'
import { createClientCommand } from '../src/command'

const logger = new Logger(module)

const createPeerDescriptorOutput = (peerDescriptor: PeerDescriptor) => {
    return {
        nodeId: toNodeId(peerDescriptor),
        type: peerDescriptor.type,
        udp: peerDescriptor.udp,
        tcp: peerDescriptor.tcp,
        websocket: peerDescriptor.websocket,
        region: peerDescriptor.region,
        ipAddress: peerDescriptor.ipAddress,
        publicKey: (peerDescriptor.publicKey !== undefined) ? binaryToHex(peerDescriptor.publicKey) : undefined,
        signature: (peerDescriptor.signature !== undefined) ? binaryToHex(peerDescriptor.signature) : undefined
    }
}

const createNodeInfoOutput = (nodeInfo: NodeInfo) => {
    return {
        peerDescriptor: createPeerDescriptorOutput(nodeInfo.peerDescriptor),
        controlLayer: {
            neighbors: nodeInfo.controlLayer.neighbors.map((n: PeerDescriptor) => toNodeId(n)),
            connections: nodeInfo.controlLayer.connections.map((n: PeerDescriptor) => toNodeId(n))
        },
        streamPartitions: nodeInfo.streamPartitions.map((sp: StreamPartitionInfo) => ({
            id: sp.id,
            controlLayerNeighbors: sp.controlLayerNeighbors.map((n: PeerDescriptor) => toNodeId(n)),
            deprecatedContentDeliveryLayerNeighbors: sp.deprecatedContentDeliveryLayerNeighbors.map((n: PeerDescriptor) => toNodeId(n)),
            contentDeliveryLayerNeighbors: sp.contentDeliveryLayerNeighbors.map((n: ContentDeliveryLayerNeighborInfo) => ({
                nodeId: toNodeId(n.peerDescriptor!),
                rtt: n.rtt
            }))
        })),
        version: nodeInfo.version
    }
}

createClientCommand(async (client: StreamrClient, nodeId: string) => {
    const networkNode = await client.getNode().getNode() as NetworkNode
    const controlLayerNode = networkNode.stack.getControlLayerNode()
    const peerDescriptors = await (controlLayerNode as DhtNode).findClosestNodesFromDht(nodeId as DhtAddress)
    const peerDescriptor = peerDescriptors.find((pd) => toDhtAddress(pd.nodeId) === nodeId)
    if (peerDescriptor !== undefined) {
        const info = await networkNode.stack.fetchNodeInfo(peerDescriptor)
        console.log(JSON.stringify(createNodeInfoOutput(info), undefined, 4))
    } else {
        logger.error('No peer descriptor found')
    }
})
    .description('show detailed information about a node')
    .arguments('nodeId')
    .parseAsync()
