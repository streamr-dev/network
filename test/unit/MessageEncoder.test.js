const assert = require('assert')
const encoder = require('../../src/MessageEncoder')
const StreamrBinaryMessage = require('../../src/protocol/StreamrBinaryMessage')
const StreamrBinaryMessageWithKafkaMetadata = require('../../src/protocol/StreamrBinaryMessageWithKafkaMetadata')

describe('MessageEncoder', () => {
    let payload
    let msgWithMetaDataAsArray
    const timestamp = 1490355900000

    beforeEach(() => {
        payload = JSON.stringify({
            hello: 'world',
            numberOfTheBeast: 666,
        })
        const streamrBinaryMessage = new StreamrBinaryMessage(
            'streamId', 0, new Date(timestamp), 0,
            StreamrBinaryMessage.CONTENT_TYPE_JSON, Buffer.from(payload, 'utf8'),
        )
        const msgWithMetaData = new StreamrBinaryMessageWithKafkaMetadata(streamrBinaryMessage, 25, 24, 0)
        msgWithMetaDataAsArray = msgWithMetaData.toArray()
    })

    it('broadcastMessage produces correct messages', () => {
        const expected = JSON.stringify([0, 0, '', [28, 'streamId', 0, timestamp, 0, 25, 24, 27, payload]])
        assert.equal(encoder.broadcastMessage(msgWithMetaDataAsArray), expected)
    })

    describe('unicastMessage', () => {
        it('without subId produces correct messages', () => {
            const expected = JSON.stringify([0, 1, '', [28, 'streamId', 0, timestamp, 0, 25, 24, 27, payload]])
            assert.equal(encoder.unicastMessage(msgWithMetaDataAsArray), expected)
        })

        it('with subId produces correct messages', () => {
            const expected = JSON.stringify([0, 1, 'subId', [28, 'streamId', 0, timestamp, 0, 25, 24, 27, payload]])
            assert.equal(encoder.unicastMessage(msgWithMetaDataAsArray, 'subId'), expected)
        })
    })

    it('subscribedMessage produces correct messages', () => {
        const expected = JSON.stringify([0, 2, '', [28, 'streamId', 0, timestamp, 0, 25, 24, 27, payload]])
        assert.equal(encoder.subscribedMessage(msgWithMetaDataAsArray), expected)
    })

    it('unsubscribedMessage produces correct messages', () => {
        const expected = JSON.stringify([0, 3, '', [28, 'streamId', 0, timestamp, 0, 25, 24, 27, payload]])
        assert.equal(encoder.unsubscribedMessage(msgWithMetaDataAsArray), expected)
    })

    it('resendingMessage produces correct messages', () => {
        const expected = JSON.stringify([0, 4, '', [28, 'streamId', 0, timestamp, 0, 25, 24, 27, payload]])
        assert.equal(encoder.resendingMessage(msgWithMetaDataAsArray), expected)
    })

    it('resentMessage produces correct messages', () => {
        const expected = JSON.stringify([0, 5, '', [28, 'streamId', 0, timestamp, 0, 25, 24, 27, payload]])
        assert.equal(encoder.resentMessage(msgWithMetaDataAsArray), expected)
    })

    it('noResendMessage produces correct messages', () => {
        const expected = JSON.stringify([0, 6, '', [28, 'streamId', 0, timestamp, 0, 25, 24, 27, payload]])
        assert.equal(encoder.noResendMessage(msgWithMetaDataAsArray), expected)
    })

    it('errorMessage produces correct messages', () => {
        const expected = JSON.stringify([0, 7, '', [28, 'streamId', 0, timestamp, 0, 25, 24, 27, payload]])
        assert.equal(encoder.errorMessage(msgWithMetaDataAsArray), expected)
    })
})
