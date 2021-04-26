import sinon from 'sinon'
import { NetworkNode, Protocol } from 'streamr-network'
import { MetricsContext } from 'streamr-network'
import { Publisher } from '../../src/Publisher'
import { Todo } from '../types'

const { StreamMessage, MessageID } = Protocol.MessageLayer

function formMessage(timestamp: number) {
    return new StreamMessage({
        messageId: new MessageID('streamId', 0, timestamp, 0, 'publisherId', 'msgChainId'),
        content: {
            hello: 'world'
        },
    })
}

describe('Publisher', () => {
    let networkNode: NetworkNode
    let validator: Todo
    let publisher: Publisher

    beforeEach(() => {
        // @ts-expect-error
        networkNode = {
            publish: sinon.stub().resolves()
        }
        validator = {
            validate: sinon.stub().resolves()
        }
        publisher = new Publisher(networkNode, validator, new MetricsContext(null as any))
    })

    describe('validateAndPublish', () => {
        it('calls the validator', async () => {
            await publisher.validateAndPublish(formMessage(135135135))
            expect(validator.validate.calledWith(formMessage(135135135))).toBe(true)
        })

        it('throws on invalid messages', () => {
            validator.validate = sinon.stub().rejects()
            return expect(publisher.validateAndPublish(formMessage(135135135))).rejects.toThrow()
        })

        it('rejects on messages too far in the future', () => {
            return expect(publisher.validateAndPublish(formMessage(Date.now() + 400000))).rejects
                .toThrow(new Error('Failed publish to stream streamId, reason: future timestamps are not allowed, max allowed +300000 ms'))
        })

        it('should call NetworkNode.publish with correct values', async () => {
            await publisher.validateAndPublish(formMessage(135135135))
            expect((networkNode.publish as any).calledWith(formMessage(135135135))).toBe(true)
        })
    })
})
