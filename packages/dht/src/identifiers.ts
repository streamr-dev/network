import { BrandedString, binaryToHex, hexToBinary } from '@streamr/utils'
import crypto from 'crypto'

// https://www.scs.stanford.edu/~dm/home/papers/kpos.pdf
const KADEMLIA_ID_LENGTH_IN_BYTES = 20

export type NodeID = BrandedString<'NodeID'>
export type DataKey = BrandedString<'DataKey'>
export type NodeIDOrDataKeyRaw = Uint8Array

export const getNodeIdFromRaw = (id: NodeIDOrDataKeyRaw): NodeID => {
    return binaryToHex(id) as unknown as NodeID
}

export const getDataKeyFromRaw = (key: NodeIDOrDataKeyRaw): DataKey => {
    return binaryToHex(key) as unknown as DataKey
}

export const getNodeIdOrDataKeyFromRaw = (key: NodeIDOrDataKeyRaw): NodeID | DataKey => {
    return binaryToHex(key) as unknown as NodeID | DataKey
}

export const getRawFromNodeIdOrDataKey = (nodeIdOrDataKey: NodeID | DataKey): NodeIDOrDataKeyRaw => {
    return hexToBinary(nodeIdOrDataKey)
}

// shorter aliases which can be used when we know the type of raw input

export const getRawFromNodeId = (nodeId: NodeID): NodeIDOrDataKeyRaw => {
    return getRawFromNodeIdOrDataKey(nodeId)
}

export const getRawFromDataKey = (dataKey: DataKey): NodeIDOrDataKeyRaw => {
    return getRawFromNodeIdOrDataKey(dataKey)
}

// TODO this should return NodeID (or NodeID | DataKey)
// TODO maybe rename this to createRandomNodeIdOrDataKey?
export const createRandomNodeId = (): Uint8Array => {
    return crypto.randomBytes(KADEMLIA_ID_LENGTH_IN_BYTES)
}
