import { counterId } from '../../src/utils'
import { Context } from '../../src/brubeck/Context'
import { Debug, Msg } from '../utils'
import MessageStream from '../../src/brubeck/MessageStream'
import { StreamMessage, MessageID } from 'streamr-client-protocol'

describe('MessageStream', () => {
    let context: Context

    beforeEach(() => {
        const id = counterId('MessageStreamTest')
        context = {
            id,
            debug: Debug(id),
        }
    })

    it('works', async () => {
        const s = new MessageStream(context)
        const testMessage = Msg()
        const streamMessage = new StreamMessage({
            messageId: new MessageID('streamId', 0, 1, 0, 'publisherId', 'msgChainId'),
            content: testMessage,
        })
        s.push(streamMessage)
        const received = []
        for await (const msg of s) {
            received.push(msg)
            break
        }

        expect(received).toEqual([streamMessage])
    })

    it('handles errors', async () => {
        const testMessage = Msg()
        const s = new MessageStream<typeof testMessage>(context)
        const err = new Error(counterId('expected error'))
        const received: StreamMessage<typeof testMessage>[] = []
        s.throw(err)
        await expect(async () => {
            for await (const msg of s) {
                received.push(msg)
                break
            }
        }).rejects.toThrow(err)

        expect(received).toEqual([])
    })

    it('handles error during iteration', async () => {
        const testMessage = Msg()
        const s = new MessageStream<typeof testMessage>(context)
        const err = new Error(counterId('expected error'))
        const streamMessage = new StreamMessage({
            messageId: new MessageID('streamId', 0, 1, 0, 'publisherId', 'msgChainId'),
            content: testMessage,
        })
        s.push(streamMessage)
        const onEnd = jest.fn()
        s.on('end', onEnd)
        const received: StreamMessage<typeof testMessage>[] = []
        await expect(async () => {
            for await (const msg of s) {
                received.push(msg)
                throw err
            }
        }).rejects.toThrow(err)
        expect(onEnd).toHaveBeenCalledTimes(1)

        expect(received).toEqual([streamMessage])
    })

    it('emits errors', async () => {
        const testMessage = Msg()
        const s = new MessageStream<typeof testMessage>(context)
        const onMessageStreamError = jest.fn((err) => {
            throw err
        })
        s.on('error', onMessageStreamError)
        const err = new Error(counterId('expected error'))
        const streamMessage = new StreamMessage({
            messageId: new MessageID('streamId', 0, 1, 0, 'publisherId', 'msgChainId'),
            content: testMessage,
        })
        s.push(streamMessage)
        const onEnd = jest.fn()
        s.on('end', onEnd)
        const received: StreamMessage<typeof testMessage>[] = []
        await expect(async () => {
            for await (const msg of s) {
                received.push(msg)
                await s.throw(err)
            }
        }).rejects.toThrow(err)
        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(onMessageStreamError).toHaveBeenCalledTimes(1)

        expect(received).toEqual([streamMessage])
    })

    it('does not reject iteration if no rethrow error event', async () => {
        const testMessage = Msg()
        const s = new MessageStream<typeof testMessage>(context)
        const onMessageStreamError = jest.fn()
        s.on('error', onMessageStreamError)
        const err = new Error(counterId('expected error'))
        const streamMessage = new StreamMessage({
            messageId: new MessageID('streamId', 0, 1, 0, 'publisherId', 'msgChainId'),
            content: testMessage,
        })
        s.push(streamMessage)
        const onEnd = jest.fn()
        s.on('end', onEnd)
        const received: StreamMessage<typeof testMessage>[] = []
        for await (const msg of s) {
            received.push(msg)
            await s.throw(err)
        }
        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(onMessageStreamError).toHaveBeenCalledTimes(1)

        expect(received).toEqual([streamMessage])
    })

    it('processes buffer before handling errors', async () => {
        const testMessage = Msg()
        const s = new MessageStream<typeof testMessage>(context)
        const err = new Error(counterId('expected error'))

        const onEnd = jest.fn()
        s.on('end', onEnd)
        const streamMessage = new StreamMessage({
            messageId: new MessageID('streamId', 0, 1, 0, 'publisherId', 'msgChainId'),
            content: testMessage,
        })
        s.push(streamMessage)
        s.end(err)
        expect(onEnd).toHaveBeenCalledTimes(0)
        const received: StreamMessage<typeof testMessage>[] = []
        await expect(async () => {
            for await (const msg of s) {
                received.push(msg)
            }
        }).rejects.toThrow(err)

        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(received).toEqual([streamMessage])
    })
})
