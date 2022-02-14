import { convertTestNet3Status } from '../../src/logic/tracker/Tracker'
import { StatusValidator } from '../../src/helpers/SchemaValidators'
import { StatusMessage } from 'streamr-client-protocol'

describe(convertTestNet3Status, () => {
    it('converts tn3 status into a valid format', () => {
        const validator = new StatusValidator()
        // eslint-disable-next-line max-len
        const oldStatusFormat = JSON.parse('{"stream":{"streamKey":"0x0000000000000000000000000000000000000000/foo/bar::0","inboundNodes":[],"outboundNodes":[],"counter":0},"started":"1/21/2022, 10:38:28 PM","location":{"latitude":null,"longitude":null,"country":null,"city":null},"extra":{},"rtts":null,"streamPart":{"streamKey":"0x81baed893251691665a18822889c6f25db709317/ejemplo::0","inboundNodes":[],"outboundNodes":[],"counter":0}}')

        const statusMessage = new StatusMessage({
            requestId: 'reequestId',
            status: oldStatusFormat
        })
        convertTestNet3Status(statusMessage)
        const result = validator.validate(statusMessage.status)
        expect(result).toEqual(true)
    })
})
