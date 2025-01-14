#!/usr/bin/env node
import '../src/logLevel'

import { DhtNode, PeerDescriptor, toDhtAddress, toNodeId } from '@streamr/dht'
import StreamrClient, { DhtAddress } from '@streamr/sdk'
import { NetworkNode, NodeInfo, StreamPartitionInfo } from '@streamr/trackerless-network'
import { binaryToHex, ChangeFieldType, Logger } from '@streamr/utils'
import { createClientCommand } from '../src/command'
import semver from 'semver'

const logger = new Logger(module)

export type NormalizedNodeInfo = ChangeFieldType<
    NodeInfo,
    'streamPartitions',
    Omit<StreamPartitionInfo, 'deprecatedContentDeliveryLayerNeighbors'>[]
>

const toNormalizeNodeInfo = (info: NodeInfo): NormalizedNodeInfo => {
    const isLegacyFormat = semver.satisfies(semver.coerce(info.applicationVersion)!, '< 102.0.0')
    return {
        ...info,
        streamPartitions: info.streamPartitions.map((sp: StreamPartitionInfo) => ({
            ...sp,
            contentDeliveryLayerNeighbors: !isLegacyFormat
                ? sp.contentDeliveryLayerNeighbors
                : sp.deprecatedContentDeliveryLayerNeighbors.map((n) => ({
                      peerDescriptor: n
                  }))
        }))
    }
}

const createPeerDescriptorOutput = (peerDescriptor: PeerDescriptor) => {
    return {
        nodeId: toNodeId(peerDescriptor),
        type: peerDescriptor.type,
        udp: peerDescriptor.udp,
        tcp: peerDescriptor.tcp,
        websocket: peerDescriptor.websocket,
        region: peerDescriptor.region,
        ipAddress: peerDescriptor.ipAddress,
        publicKey: peerDescriptor.publicKey !== undefined ? binaryToHex(peerDescriptor.publicKey) : undefined,
        signature: peerDescriptor.signature !== undefined ? binaryToHex(peerDescriptor.signature) : undefined
    }
}

const createNodeInfoOutput = (nodeInfo: NormalizedNodeInfo) => {
    return {
        peerDescriptor: createPeerDescriptorOutput(nodeInfo.peerDescriptor),
        controlLayer: {
            neighbors: nodeInfo.controlLayer.neighbors.map((n) => toNodeId(n)),
            connections: nodeInfo.controlLayer.connections.map((n) => toNodeId(n))
        },
        streamPartitions: nodeInfo.streamPartitions.map((sp) => ({
            id: sp.id,
            controlLayerNeighbors: sp.controlLayerNeighbors.map((n) => toNodeId(n)),
            contentDeliveryLayerNeighbors: sp.contentDeliveryLayerNeighbors.map((n) => ({
                nodeId: toNodeId(n.peerDescriptor),
                rtt: n.rtt
            }))
        })),
        applicationVersion: nodeInfo.applicationVersion
    }
}

createClientCommand(async (client: StreamrClient, nodeId: string) => {
    const networkNode = (await client.getNode().getNode()) as NetworkNode
    const controlLayerNode = networkNode.stack.getControlLayerNode()
    const peerDescriptors = await (controlLayerNode as DhtNode).findClosestNodesFromDht(nodeId as DhtAddress)
    const peerDescriptor = peerDescriptors.find((pd) => toDhtAddress(pd.nodeId) === nodeId)
    if (peerDescriptor !== undefined) {
        const info = await networkNode.stack.fetchNodeInfo(peerDescriptor)
        const normalizedInfo = toNormalizeNodeInfo(info)
        console.info(JSON.stringify(createNodeInfoOutput(normalizedInfo), undefined, 4))
    } else {
        logger.error('No peer descriptor found')
    }
})
    .description('show detailed information about a node')
    .arguments('nodeId')
    .parseAsync()
