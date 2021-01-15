import { ControlLayer } from 'streamr-client-protocol'

import { decode } from '../../src/helpers/MessageEncoder'

describe('encoder', () => {
    const controlMessage = new ControlLayer.ResendResponseNoResend({
        requestId: 'requestId',
        streamId: 'streamId',
        streamPartition: 0,
    })

    it('decode', () => {
        const result = decode(controlMessage.serialize(), ControlLayer.ControlMessage.deserialize)
        expect(result).toEqual(controlMessage)
    })

    it('decode returns null if controlMessage unparsable', () => {
        const result = decode('NOT_A_VALID_CONTROL_MESSAGE', ControlLayer.ControlMessage.deserialize)
        expect(result).toBeNull()
    })

    it('decode returns null if unknown control message version', () => {
        const result = decode('[6666,2,"requestId","streamId",0]', ControlLayer.ControlMessage.deserialize)
        expect(result).toBeNull()
    })

    it('decode returns null if unknown control message type', () => {
        const result = decode('[2,6666,"requestId","streamId",0]', ControlLayer.ControlMessage.deserialize)
        expect(result).toBeNull()
    })
})

