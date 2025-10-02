import omit from 'lodash/omit'
import { ZodError } from 'zod'
import { createHeartbeatMessage, HeartbeatMessageSchema } from '../../../../src/plugins/operator/heartbeatUtils'

const PEER_DESCRIPTOR = Object.freeze({
    nodeId: 'nodeId',
    websocket: {
        port: 31313,
        host: '127.0.0.1',
        tls: false
    }
})

describe('heartbeatUtils', () => {
    it('messages created with createHeartbeatMessage pass validation', () => {
        const msg = createHeartbeatMessage(PEER_DESCRIPTOR, { plugins: {} })
        expect(() => HeartbeatMessageSchema.parse(msg)).not.toThrow()
    })

    it('messages with extra fields pass validation', () => {
        const msg = {
            foobar: 'foobar',
            ...createHeartbeatMessage(PEER_DESCRIPTOR, { plugins: {} })
        }
        expect(() => HeartbeatMessageSchema.parse(msg)).not.toThrow()
    })

    it('messages without applicationVersion pass validation', () => {
        const msg = omit(
            createHeartbeatMessage(PEER_DESCRIPTOR, { plugins: {} }),
            'applicationVersion'
        )
        expect(() => HeartbeatMessageSchema.parse(msg)).not.toThrow()
    })

    it('messages without autostakerEnabled pass validation', () => {
        const msg = omit(
            createHeartbeatMessage(PEER_DESCRIPTOR, { plugins: {} }),
            'autostakerEnabled'
        )
        expect(() => HeartbeatMessageSchema.parse(msg)).not.toThrow()
    })

    it('invalid message does not pass validation', () => {
        const msg = createHeartbeatMessage({
            foo: 'bar'
        } as any, { plugins: {} })
        expect(() => HeartbeatMessageSchema.parse(msg)).toThrow(ZodError)
    })

    it('autostakerEnabled is true if and only if autostaker plugin is enabled', () => {
        const msg1 = createHeartbeatMessage(PEER_DESCRIPTOR, { plugins: {} })
        expect(msg1.autostakerEnabled).toBeFalse()

        const msg2 = createHeartbeatMessage(PEER_DESCRIPTOR, { plugins: { autostaker: {} } })
        expect(msg2.autostakerEnabled).toBeTrue()
    })
})
