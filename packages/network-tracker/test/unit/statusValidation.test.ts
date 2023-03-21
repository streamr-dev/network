import { StatusMessage } from "@streamr/protocol"
import { StatusValidator } from '../../src/helpers/SchemaValidators'

describe('statusValidation', () => {
    it('happy path', () => {
        const validator = new StatusValidator()
        const statusMessage = new StatusMessage({
            status: {
                streamPart: {
                    id: 'a',
                    partition: 0,
                    neighbors: [],
                    counter: 0
                }
            },
            requestId: 'request'
        })
        expect(validator.validate(statusMessage.status)).toEqual(true)
    })

    it('fails with empty string as streamId', () => {
        const validator = new StatusValidator()
        const statusMessage = new StatusMessage({
            status: {
                streamPart: {
                    id: '',
                    partition: 0,
                    neighbors: [],
                    counter: 0
                }
            },
            requestId: 'request'
        })
        expect(validator.validate(statusMessage.status)).toEqual(false)
    })
})
