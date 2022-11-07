import { ControlMessage, ErrorCode, ErrorResponse, TrackerMessage, TrackerMessageType } from '@streamr/protocol'

import { decode } from '../../src/protocol/utils'

describe('decode', () => {
    const controlMessage = new ErrorResponse({
        requestId: 'requestId',
        errorMessage: 'This is an error',
        errorCode: ErrorCode.AUTHENTICATION_FAILED
    })

    it('decode', () => {
        const result = decode(controlMessage.serialize(), ControlMessage.deserialize)
        expect(result).toEqual(controlMessage)
    })

    it('decode returns null if controlMessage unparsable', () => {
        const result = decode('NOT_A_VALID_CONTROL_MESSAGE', ControlMessage.deserialize)
        expect(result).toBeNull()
    })

    it('decode returns null if unknown control message version', () => {
        const result = decode('[6666,2,"requestId","streamId",0]', ControlMessage.deserialize)
        expect(result).toBeNull()
    })

    it('decode returns null if unknown control message type', () => {
        const result = decode('[2,6666,"requestId","streamId",0]', ControlMessage.deserialize)
        expect(result).toBeNull()
    })

    it('decode returns null if message validation fails', () => {
        const errorMessage = JSON.stringify([2, TrackerMessageType.ErrorMessage, 'requestId', 'invalid-error-code', 'targetNode'])
        const result = decode(errorMessage, TrackerMessage.deserialize)
        expect(result).toBeNull()
    })
})

