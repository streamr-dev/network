import { z } from 'zod'
import { NetworkPeerDescriptor } from 'streamr-client'

export const HeartbeatMessageSchema = z.object({
    msgType: z.enum(['heartbeat']),
    peerDescriptor: z.object({
        id: z.string(),
        websocket: z.optional(z.object({
            ip: z.string(),
            port: z.number()
        })),
        openInternet: z.optional(z.boolean()),
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
