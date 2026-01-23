import { NetworkNodeType, type NetworkPeerDescriptor } from '@streamr/sdk'
import { z } from 'zod'
import { version as applicationVersion } from '../../../package.json'
import { StrictConfig } from '../../config/config'

export const HeartbeatMessageSchema = z.object({
    msgType: z.enum(['heartbeat']),
    peerDescriptor: z.object({
        nodeId: z.string(),
        type: z.optional(z.nativeEnum(NetworkNodeType)),
        websocket: z.optional(z.object({
            host: z.string(),
            port: z.number(),
            tls: z.boolean()
        })),
        region: z.optional(z.number())
    }),
    applicationVersion: z.optional(z.string()),  // optional for backward compatibility (written from v102 onward)
    autostakerEnabled: z.optional(z.boolean()) // optional for backward compatibility
})

export type HeartbeatMessage = z.infer<typeof HeartbeatMessageSchema>

export function createHeartbeatMessage(
    peerDescriptor: NetworkPeerDescriptor,
    brokerConfig: Pick<StrictConfig, 'plugins'>
): HeartbeatMessage {
    return {
        msgType: 'heartbeat',
        peerDescriptor,
        applicationVersion,
        autostakerEnabled: brokerConfig.plugins.autostaker !== undefined,
    }
}
