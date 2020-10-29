const events = require('events')

const sinon = require('sinon')
const { StreamMessage, MessageID } = require('streamr-network').Protocol.MessageLayer
const { MetricsContext } = require('streamr-network')

const Publisher = require('../../src/Publisher')

describe('Publisher', () => {
    const stream = {
        id: 'streamId',
        partitions: 10
    }

    const msg = {
        hello: 'world'
    }

    let streamMessage
    let networkNode
    let validator
    const thresholdForFutureMessageSeconds = 5 * 60

    const getPublisher = () => new Publisher(networkNode, validator, thresholdForFutureMessageSeconds, new MetricsContext(null))

    beforeEach(() => {
        streamMessage = new StreamMessage({
            messageId: new MessageID(stream.id, 0, 135135135, 0, 'publisherId', 'msgChainId'),
            content: msg,
        })

        networkNode = new events.EventEmitter()
        networkNode.publish = sinon.stub().resolves()
        validator = {
            validate: sinon.stub().resolves()
        }
    })

    describe('validateAndPublish', () => {
        it('calls the validator', async () => {
            await getPublisher().validateAndPublish(streamMessage)
            expect(validator.validate.calledWith(streamMessage)).toBe(true)
        })

        it('throws on invalid messages', async () => {
            validator = {
                validate: sinon.stub().rejects()
            }
            await expect(getPublisher().validateAndPublish(streamMessage)).rejects.toThrow()
        })

        it('should call NetworkNode.publish with correct values', async () => {
            await getPublisher().validateAndPublish(streamMessage)
            expect(networkNode.publish.calledWith(streamMessage)).toBe(true)
        })

        it('rejects on messages too far in the future', async () => {
            streamMessage = new StreamMessage({
                messageId: new MessageID(stream.id, 0,
                    Date.now() + 1000 * (thresholdForFutureMessageSeconds + 5),
                    0, 'publisherId', 'msgChainId'),
                content: msg,
            })

            await expect(getPublisher().validateAndPublish(streamMessage)).rejects.toThrow()
        })
    })
})
