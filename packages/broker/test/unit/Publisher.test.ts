import sinon from 'sinon'
import { Protocol } from 'streamr-network'
import { MetricsContext } from 'streamr-network'
import { StreamrClient } from 'streamr-client'
import { Publisher } from '../../src/Publisher'

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
    let client: StreamrClient
    let publisher: Publisher

    beforeEach(() => {
        client = {
            // @ts-expect-error mock
            publisher: {
                validateAndPublishStreamMessage: sinon.stub().resolves()
            }
        }

        publisher = new Publisher(client, new MetricsContext(null as any))
    })

    describe('validateAndPublish', () => {
        it('throws on invalid messages', () => {
            client.publisher.validateAndPublishStreamMessage = sinon.stub().rejects()
            return expect(publisher.validateAndPublish(formMessage(135135135))).rejects.toThrow()
        })

        it('rejects on messages too far in the future', () => {
            return expect(publisher.validateAndPublish(formMessage(Date.now() + 400000))).rejects
                .toThrow(new Error('Failed publish to stream streamId, reason: future timestamps are not allowed, max allowed +300000 ms'))
        })

        it('should call publish with correct values', async () => {
            await publisher.validateAndPublish(formMessage(135135135))
            expect((client.publisher.validateAndPublishStreamMessage as any).calledWith(formMessage(135135135))).toBe(true)
        })
    })
})
