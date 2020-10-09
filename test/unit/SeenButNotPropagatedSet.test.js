const { MessageIDStrict } = require('streamr-client-protocol').MessageLayer

const SeenButNotPropagatedSet = require('../../src/helpers/SeenButNotPropagatedSet')

describe('SeenButNotPropagatedSet', () => {
    it('messageIdToStr', () => {
        const messageId = new MessageIDStrict('streamId', 10, 1000000, 0, 'publisherId', 'msgChainId')
        const actual = SeenButNotPropagatedSet.messageIdToStr(messageId)
        expect(actual).toEqual('streamId-10-1000000-0-publisherId-msgChainId')
    })
})
