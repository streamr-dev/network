import { z } from 'zod'
import { NetworkNodeType, NetworkPeerDescriptor } from '@streamr/sdk'

export const HeartbeatMessageSchema = z.object({
    msgType: z.enum(['heartbeat']),
    peerDescriptor: z.object({
        nodeId: z.string(),
        type: z.optional(z.nativeEnum(NetworkNodeType)),
        websocket: z.optional(
            z.object({
                host: z.string(),
                port: z.number(),
                tls: z.boolean()
            })
        ),
        region: z.optional(z.number())
    })
})

export type HeartbeatMessage = z.infer<typeof HeartbeatMessageSchema>

export function createHeartbeatMessage(peerDescriptor: NetworkPeerDescriptor): HeartbeatMessage {
    return {
        msgType: 'heartbeat',
        peerDescriptor
    }
}
