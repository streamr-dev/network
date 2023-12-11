import { BrandedString, binaryToHex } from '@streamr/utils'
import crypto from 'crypto'

// https://www.scs.stanford.edu/~dm/home/papers/kpos.pdf
const KADEMLIA_ID_LENGTH_IN_BYTES = 20

// TODO this should return NodeID
export const createRandomNodeId = (): Uint8Array => {
    return crypto.randomBytes(KADEMLIA_ID_LENGTH_IN_BYTES)
}

// TODO rename the file to be "NodeID.ts" instead of "nodeId.ts"
export type NodeID = BrandedString<'NodeID'>

// TODO remove this or add support for UInt8Array parameters
export const areEqualNodeIds = (nodeId1: NodeID, nodeId2: NodeID): boolean => {
    return nodeId1 === nodeId2
}

// TODO maybe this is not needed and we can use just getNodeIdFromBinary?
export const getNodeIdFromDataKey = (key: Uint8Array): NodeID => {
    return getNodeIdFromBinary(key)
}

// TODO should we have similar method to convert nodeId to bucketId (which is just hexToBinary)
export const getNodeIdFromBinary = (id: Uint8Array): NodeID => {
    return binaryToHex(id) as unknown as NodeID
}
