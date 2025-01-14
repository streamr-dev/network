import 'reflect-metadata'

import { randomUserId, testOnlyInNodeJs } from '@streamr/test-utils'
import { collect, toStreamID, utf8ToBinary, wait } from '@streamr/utils'
import { MessageSigner } from '../../src/signature/MessageSigner'
import { pull } from '../../src/utils/PushBuffer'
import { PushPipeline } from '../../src/utils/PushPipeline'
import { counterId, instanceId } from '../../src/utils/utils'
import { LeaksDetector } from '../test-utils/LeaksDetector'
import { Msg } from '../test-utils/publish'
import { createRandomAuthentication } from '../test-utils/utils'
import { MessageID } from './../../src/protocol/MessageID'
import {
    ContentType,
    EncryptionType,
    SignatureType,
    StreamMessage,
    StreamMessageType
} from './../../src/protocol/StreamMessage'

const PUBLISHER_ID = randomUserId()

describe('PushPipeline', () => {
    const streamId = toStreamID('streamId')
    let leaksDetector: LeaksDetector
    let messageSigner: MessageSigner

    const createMockMessage = async () => {
        return await messageSigner.createSignedMessage(
            {
                messageId: new MessageID(streamId, 0, 0, 0, PUBLISHER_ID, 'msgChainId'),
                messageType: StreamMessageType.MESSAGE,
                content: utf8ToBinary(JSON.stringify(Msg())),
                contentType: ContentType.JSON,
                encryptionType: EncryptionType.NONE
            },
            SignatureType.SECP256K1
        )
    }

    beforeEach(async () => {
        leaksDetector = new LeaksDetector()
        messageSigner = new MessageSigner(createRandomAuthentication())
    })

    afterEach(async () => {
        await leaksDetector.checkNoLeaks()
    })

    testOnlyInNodeJs('works', async () => {
        // LeakDetector not supported by electron
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

    testOnlyInNodeJs('handles errors', async () => {
        // LeakDetector not supported by electron
        const testMessage = Msg()
        const err = new Error(counterId('expected error'))
        leaksDetector.add('err', err)
        leaksDetector.add('testMessage', testMessage)
        const streamMessage = await createMockMessage()
        leaksDetector.add('streamMessage', streamMessage)
        const s = new PushPipeline<StreamMessage>()
        leaksDetector.add(instanceId(s), s)
        const received: StreamMessage[] = []
        pull(
            (async function* g() {
                yield streamMessage
                throw err
            })(),
            s
        )

        await expect(async () => {
            for await (const msg of s) {
                leaksDetector.add('receivedMessage', msg)
                received.push(msg)
            }
        }).rejects.toThrow(err)

        expect(received).toEqual([streamMessage])
    })

    testOnlyInNodeJs('handles immediate errors in pull', async () => {
        // LeakDetector not supported by electron
        const testMessage = Msg()
        const err = new Error(counterId('expected error'))
        leaksDetector.add('err', err)
        leaksDetector.add('testMessage', testMessage)
        const streamMessage = await messageSigner.createSignedMessage(
            {
                messageId: new MessageID(streamId, 0, 1, 0, PUBLISHER_ID, 'msgChainId'),
                messageType: StreamMessageType.MESSAGE,
                content: utf8ToBinary(JSON.stringify(testMessage)),
                contentType: ContentType.JSON,
                encryptionType: EncryptionType.NONE
            },
            SignatureType.SECP256K1
        )
        leaksDetector.add('streamMessage', streamMessage)
        const s = new PushPipeline<StreamMessage>()
        leaksDetector.add(instanceId(s), s)
        const received: StreamMessage[] = []
        s.onError.listen((error) => {
            throw error
        })
        pull(
            // eslint-disable-next-line require-yield
            (async function* g() {
                throw err
            })(),
            s
        )

        await expect(async () => {
            for await (const msg of s) {
                leaksDetector.add('receivedMessage', msg)
                received.push(msg)
            }
        }).rejects.toThrow(err)

        expect(received).toEqual([])
    })

    testOnlyInNodeJs('handles error during iteration', async () => {
        // LeakDetector not supported by electron
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

    testOnlyInNodeJs('emits errors', async () => {
        // LeakDetector not supported by electron
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

    testOnlyInNodeJs('processes buffer before handling errors with endWrite', async () => {
        // LeakDetector not supported by electron
        const testMessage = Msg()
        leaksDetector.add('testMessage', testMessage)
        let s: PushPipeline<StreamMessage> | undefined = new PushPipeline<StreamMessage>()
        leaksDetector.add(instanceId(s), s)
        const err = new Error(counterId('expected error'))

        const streamMessage = await createMockMessage()
        leaksDetector.add('streamMessage', streamMessage)
        s.push(streamMessage)
        s.endWrite(err)
        let received: StreamMessage[] = []
        await expect(async () => {
            for await (const msg of s!) {
                leaksDetector.add('receivedMessage', msg)
                received.push(msg)
            }
        }).rejects.toThrow(err)

        expect(received).toEqual([streamMessage])

        // TODO: why does this test require clearing these local vars?
        // eslint-disable-next-line require-atomic-updates
        s = undefined
        received = []
    })

    testOnlyInNodeJs('can collect', async () => {
        // LeakDetector not supported by electron
        const s = new PushPipeline<StreamMessage>()

        const streamMessage = await createMockMessage()
        s.push(streamMessage)
        const received = await collect(s, 1)

        expect(received).toEqual([streamMessage])
    })

    testOnlyInNodeJs('can cancel collect with return', async () => {
        // LeakDetector not supported by electron
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

    testOnlyInNodeJs('can cancel collect with throw', async () => {
        // LeakDetector not supported by electron
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
