/*
 * Node id is one of these formats:
 * - userId
 * - userId#sessionId
 */

import { NodeId } from '../identifiers'

export type UserId = string // typically an Ethereum address

// TODO should we return lowercased string if we decide that userIds are case-insensitive?
export const parseUserIdFromNodeId = (nodeId: NodeId): UserId => {
    const parts = nodeId.split('#')
    return parts[0]
}
