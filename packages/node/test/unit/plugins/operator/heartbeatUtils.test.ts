import { createHeartbeatMessage, HeartbeatMessageSchema } from '../../../../src/plugins/operator/heartbeatUtils'
import { ZodError } from 'zod'

describe('heartbeatUtils', () => {
    it('messages created with createHeartbeatMessage pass validation', () => {
        const msg = createHeartbeatMessage({
            nodeId: 'nodeId',
            websocket: {
                port: 31313,
                host: '127.0.0.1',
                tls: false
            }
        })
        expect(() => HeartbeatMessageSchema.parse(msg)).not.toThrow()
    })

    it('invalid message does not pass validation', () => {
        const msg = createHeartbeatMessage({
            foo: 'bar'
        } as any)
        expect(() => HeartbeatMessageSchema.parse(msg)).toThrow(ZodError)
    })
})
