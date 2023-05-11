import { MessageID, StreamMessage, toStreamID } from '@streamr/protocol'
import { collect, toEthereumAddress, wait } from '@streamr/utils'
import { Authentication } from '../../src/Authentication'
import { createSignedMessage } from '../../src/publish/MessageFactory'
import { PushPipeline } from '../../src/utils/PushPipeline'
import { counterId, instanceId } from '../../src/utils/utils'
import { LeaksDetector } from '../test-utils/LeaksDetector'
import { Msg } from '../test-utils/publish'
import { createRandomAuthentication } from '../test-utils/utils'

const PUBLISHER_ID = toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

describe('PushPipeline', () => {

    const streamId = toStreamID('streamId')
    let leaksDetector: LeaksDetector
    let authentication: Authentication

    const createMockMessage = async () => {
        return await createSignedMessage({
            messageId: new MessageID(streamId, 0, 0, 0, PUBLISHER_ID, 'msgChainId'),
            serializedContent: JSON.stringify(Msg()),
            authentication
        })
    }

    beforeEach(async () => {
        leaksDetector = new LeaksDetector()
        authentication = createRandomAuthentication()
    })

    afterEach(async () => {
        await leaksDetector.checkNoLeaks()
    })

    it('works', async () => {
        const s = new PushPipeline<StreamMessage>()
        leaksDetector.add(instanceId(s), s)
        const testMessage = Msg()
        leaksDetector.add('testMessage', testMessage)
        const streamMessage = await createMockMessage()
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
        const streamMessage = await createMockMessage()
        leaksDetector.add('streamMessage', streamMessage)
        const s = new PushPipeline<StreamMessage>()
        leaksDetector.add(instanceId(s), s)
        const received: StreamMessage[] = []
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
        const streamMessage = createSignedMessage({
            messageId: new MessageID(streamId, 0, 1, 0, PUBLISHER_ID, 'msgChainId'),
            serializedContent: JSON.stringify(testMessage),
            authentication
        })
        leaksDetector.add('streamMessage', streamMessage)
        const s = new PushPipeline<StreamMessage>()
        leaksDetector.add(instanceId(s), s)
        const received: StreamMessage[] = []
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
        const s = new PushPipeline<StreamMessage>()
        leaksDetector.add(instanceId(s), s)
        const err = new Error(counterId('expected error'))
        const streamMessage = await createMockMessage()
        s.push(streamMessage)
        leaksDetector.add('streamMessage', streamMessage)
        const received: StreamMessage[] = []
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
        const s = new PushPipeline<StreamMessage>()
        leaksDetector.add(instanceId(s), s)
        const err = new Error(counterId('expected error'))
        const streamMessage = await createMockMessage()
        leaksDetector.add('streamMessage', streamMessage)
        s.push(streamMessage)
        const received: StreamMessage[] = []
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
        const s = new PushPipeline<StreamMessage>()
        leaksDetector.add(instanceId(s), s)
        const err = new Error(counterId('expected error'))

        const streamMessage = await createMockMessage()
        leaksDetector.add('streamMessage', streamMessage)
        s.push(streamMessage)
        s.endWrite(err)
        const received: StreamMessage[] = []
        await expect(async () => {
            for await (const msg of s) {
                leaksDetector.add('receivedMessage', msg)
                received.push(msg)
            }
        }).rejects.toThrow(err)

        expect(received).toEqual([streamMessage])
    })

    it('can collect', async () => {
        const s = new PushPipeline<StreamMessage>()

        const streamMessage = await createMockMessage()
        s.push(streamMessage)
        const received = await collect(s, 1)

        expect(received).toEqual([streamMessage])
    })

    it('can cancel collect with return', async () => {
        const testMessage = Msg()
        const s = new PushPipeline<StreamMessage>()
        leaksDetector.add('testMessage', testMessage)
        leaksDetector.add(instanceId(s), s)

        const streamMessage = await createMockMessage()
        leaksDetector.add('streamMessage', streamMessage)
        s.push(streamMessage)
        const collectTask = collect(s)
        await wait(10)
        await s.return()
        const received = await collectTask

        expect(received).toEqual([streamMessage])
    })

    it('can cancel collect with throw', async () => {
        const testMessage = Msg()
        const s = new PushPipeline<StreamMessage>()
        const err = new Error(counterId('expected error'))
        leaksDetector.add('testMessage', testMessage)
        leaksDetector.add(instanceId(s), s)
        leaksDetector.add('err', err)

        const streamMessage = await createMockMessage()
        leaksDetector.add('streamMessage', streamMessage)
        s.push(streamMessage)
        const collectTask = collect(s)
        await wait(10)
        await expect(async () => {
            await s.throw(err)
        }).rejects.toThrow(err)
        await expect(async () => {
            await collectTask
        }).rejects.toThrow(err)
    })
})
