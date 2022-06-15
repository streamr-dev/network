import { wait } from 'streamr-test-utils'
import { counterId } from '../../src/utils/utils'
import { Context } from '../../src/utils/Context'
import { Debug, Msg, LeaksDetector } from '../test-utils/utils'
import { MessageStream } from '../../src/subscribe/MessageStream'
import { StreamMessage, MessageID, toStreamID } from 'streamr-client-protocol'

describe('MessageStream', () => {
    const streamId = toStreamID('streamId')
    let context: Context
    let leaksDetector: LeaksDetector

    beforeEach(async () => {
        leaksDetector = new LeaksDetector()
        const id = counterId('MessageStreamTest')
        context = {
            id,
            debug: Debug(id),
        }
    })

    afterEach(async () => {
        await leaksDetector.checkNoLeaks()
    })

    it('works', async () => {
        const s = new MessageStream(context)
        leaksDetector.add(s.id, s)
        const testMessage = Msg()
        leaksDetector.add('testMessage', testMessage)
        const streamMessage = new StreamMessage({
            messageId: new MessageID(streamId, 0, 1, 0, 'publisherId', 'msgChainId'),
            content: testMessage,
        })
        leaksDetector.add('streamMessage', streamMessage)
        s.push(streamMessage)
        const received = []
        for await (const msg of s) {
            leaksDetector.add('receivedMessage', msg)
            received.push(msg)
            break
        }

        expect(received).toEqual([streamMessage])
    })

    it('handles errors', async () => {
        const testMessage = Msg()
        const err = new Error(counterId('expected error'))
        leaksDetector.add('err', err)
        leaksDetector.add('testMessage', testMessage)
        const streamMessage = new StreamMessage({
            messageId: new MessageID(streamId, 0, 1, 0, 'publisherId', 'msgChainId'),
            content: testMessage,
        })
        leaksDetector.add('streamMessage', streamMessage)
        const s = new MessageStream<typeof testMessage>(context)
        leaksDetector.add(s.id, s)
        const received: StreamMessage<typeof testMessage>[] = []
        s.pull((async function* g() {
            yield streamMessage

            throw err
        }()))

        await expect(async () => {
            for await (const msg of s) {
                leaksDetector.add('receivedMessage', msg)
                received.push(msg)
            }
        }).rejects.toThrow(err)

        expect(received).toEqual([streamMessage])
    })

    it('handles immediate errors in pull', async () => {
        const testMessage = Msg()
        const err = new Error(counterId('expected error'))
        leaksDetector.add('err', err)
        leaksDetector.add('testMessage', testMessage)
        const streamMessage = new StreamMessage({
            messageId: new MessageID(streamId, 0, 1, 0, 'publisherId', 'msgChainId'),
            content: testMessage,
        })
        leaksDetector.add('streamMessage', streamMessage)
        const s = new MessageStream<typeof testMessage>(context)
        leaksDetector.add(s.id, s)
        const received: StreamMessage<typeof testMessage>[] = []
        s.onError.listen((error) => {
            throw error
        })
        // eslint-disable-next-line require-yield
        s.pull((async function* g() {
            throw err
        }()))

        await expect(async () => {
            for await (const msg of s) {
                leaksDetector.add('receivedMessage', msg)
                received.push(msg)
            }
        }).rejects.toThrow(err)

        expect(received).toEqual([])
    })

    it('handles error during iteration', async () => {
        const testMessage = Msg()
        leaksDetector.add('testMessage', testMessage)
        const s = new MessageStream<typeof testMessage>(context)
        leaksDetector.add(s.id, s)
        const err = new Error(counterId('expected error'))
        const streamMessage = new StreamMessage({
            messageId: new MessageID(streamId, 0, 1, 0, 'publisherId', 'msgChainId'),
            content: testMessage,
        })
        s.push(streamMessage)
        leaksDetector.add('streamMessage', streamMessage)
        const received: StreamMessage<typeof testMessage>[] = []
        await expect(async () => {
            for await (const msg of s) {
                leaksDetector.add('receivedMessage', msg)
                received.push(msg)
                throw err
            }
        }).rejects.toThrow(err)

        expect(received).toEqual([streamMessage])
    })

    it('emits errors', async () => {
        const testMessage = Msg()
        leaksDetector.add('testMessage', testMessage)
        const s = new MessageStream<typeof testMessage>(context)
        leaksDetector.add(s.id, s)
        const err = new Error(counterId('expected error'))
        const streamMessage = new StreamMessage({
            messageId: new MessageID(streamId, 0, 1, 0, 'publisherId', 'msgChainId'),
            content: testMessage,
        })
        leaksDetector.add('streamMessage', streamMessage)
        s.push(streamMessage)
        const received: StreamMessage<typeof testMessage>[] = []
        await expect(async () => {
            for await (const msg of s) {
                leaksDetector.add('receivedMessage', msg)
                received.push(msg)
                setTimeout(() => {
                    s.throw(err).catch(() => {})
                })
            }
        }).rejects.toThrow(err)
        await wait(10)

        expect(received).toEqual([streamMessage])
    })

    it('processes buffer before handling errors with endWrite', async () => {
        const testMessage = Msg()
        leaksDetector.add('testMessage', testMessage)
        const s = new MessageStream<typeof testMessage>(context)
        leaksDetector.add(s.id, s)
        const err = new Error(counterId('expected error'))

        const streamMessage = new StreamMessage({
            messageId: new MessageID(streamId, 0, 1, 0, 'publisherId', 'msgChainId'),
            content: testMessage,
        })
        leaksDetector.add('streamMessage', streamMessage)
        s.push(streamMessage)
        s.endWrite(err)
        const received: StreamMessage<typeof testMessage>[] = []
        await expect(async () => {
            for await (const msg of s) {
                leaksDetector.add('receivedMessage', msg)
                received.push(msg)
            }
        }).rejects.toThrow(err)

        expect(received).toEqual([streamMessage])
    })
    /*
    describe('when not started', () => {
        it('emits end with return', async () => {
            const testMessage = Msg()
            const s = new MessageStream<typeof testMessage>(context)
            const onEnd = jest.fn()
            s.on('end', onEnd)
            await s.return()

            expect(onEnd).toHaveBeenCalledTimes(1)
        })

        it('emits end with return', async () => {
            const testMessage = Msg()
            const s = new MessageStream<typeof testMessage>(context)

            const onEnd = jest.fn()
            s.on('end', onEnd)
            await s.return()

            expect(onEnd).toHaveBeenCalledTimes(1)
        })

        it('emits end + error with throw', async () => {
            const testMessage = Msg()
            const s = new MessageStream<typeof testMessage>(context)

            const onEnd = jest.fn()
            const onMessageStreamError = jest.fn()
            s.on('end', onEnd)
            s.on('error', onMessageStreamError)
            const err = new Error(counterId('expected error'))
            await expect(async () => {
                await s.throw(err)
            }).rejects.toThrow(err)

            expect(onEnd).toHaveBeenCalledTimes(1)
            expect(onMessageStreamError).toHaveBeenCalledTimes(1)
        })
    })
    */

    it('can collect', async () => {
        const testMessage = Msg()
        const s = new MessageStream<typeof testMessage>(context)

        const streamMessage = new StreamMessage({
            messageId: new MessageID(streamId, 0, 1, 0, 'publisherId', 'msgChainId'),
            content: testMessage,
        })
        s.push(streamMessage)
        const received = await s.collect(1)

        expect(received).toEqual([streamMessage])
    })

    it('can cancel collect with return', async () => {
        const testMessage = Msg()
        const s = new MessageStream<typeof testMessage>(context)
        leaksDetector.add('testMessage', testMessage)
        leaksDetector.add(s.id, s)

        const streamMessage = new StreamMessage({
            messageId: new MessageID(streamId, 0, 1, 0, 'publisherId', 'msgChainId'),
            content: testMessage,
        })
        leaksDetector.add('streamMessage', streamMessage)
        s.push(streamMessage)
        const collectTask = s.collect()
        await wait(10)
        await s.return()
        const received = await collectTask

        expect(received).toEqual([streamMessage])
    })

    it('can cancel collect with throw', async () => {
        const testMessage = Msg()
        const s = new MessageStream<typeof testMessage>(context)
        const err = new Error(counterId('expected error'))
        leaksDetector.add('testMessage', testMessage)
        leaksDetector.add(s.id, s)
        leaksDetector.add('err', err)

        const streamMessage = new StreamMessage({
            messageId: new MessageID(streamId, 0, 1, 0, 'publisherId', 'msgChainId'),
            content: testMessage,
        })
        leaksDetector.add('streamMessage', streamMessage)
        s.push(streamMessage)
        const collectTask = s.collect()
        await wait(10)
        await expect(async () => {
            await s.throw(err)
        }).rejects.toThrow(err)
        await expect(async () => {
            await collectTask
        }).rejects.toThrow(err)
    })
})
