import { MessageLayer } from 'streamr-client-protocol'

import { SeenButNotPropagatedSet } from '../../src/helpers/SeenButNotPropagatedSet'

const { MessageIDStrict } = MessageLayer

describe('SeenButNotPropagatedSet', () => {
    it('messageIdToStr', () => {
        const messageId = new MessageIDStrict('streamId', 10, 1000000, 0, 'publisherId', 'msgChainId')
        const actual = SeenButNotPropagatedSet.messageIdToStr(messageId)
        expect(actual).toEqual('streamId-10-1000000-0-publisherId-msgChainId')
    })
})
