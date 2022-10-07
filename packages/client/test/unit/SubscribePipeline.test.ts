import 'reflect-metadata'
import { GroupKey } from './../../src/encryption/GroupKey'
import { StreamMessage, StreamPartID, StreamPartIDUtils, toStreamID } from 'streamr-client-protocol'
import { Wallet } from '@ethersproject/wallet'
import { createMockMessage } from './../test-utils/utils'
import { MessageStream } from './../../src/subscribe/MessageStream'
import { fastWallet, randomEthereumAddress } from "streamr-test-utils"
import { createSubscribePipeline } from "../../src/subscribe/SubscribePipeline"
import { mockContext } from '../test-utils/utils'
import { collect } from '../../src/utils/GeneratorUtils'
import { DecryptError } from '../../src/encryption/EncryptionUtil'
import { Stream } from '../../src'
import { DestroySignal } from '../../src/DestroySignal'
import { sign } from '../../src/utils/signingUtils'

const CONTENT = {
    foo: 'bar'
}

describe('SubscribePipeline', () => {

    let pipeline: MessageStream
    let input: MessageStream
    let streamPartId: StreamPartID
    let publisher: Wallet

    beforeEach(async () => {
        streamPartId = StreamPartIDUtils.parse(`${randomEthereumAddress()}/path#0`)
        publisher = fastWallet()
        const stream = new Stream({
            id: toStreamID(streamPartId),
            partitions: 1
        }, {
            resolve: () => {}
        } as any)
        const context = mockContext()
        input = new MessageStream(context)
        pipeline = createSubscribePipeline({
            messageStream: input,
            streamPartId,
            context,
            resends: undefined as any,
            groupKeyStore: {
                get: async () => undefined
            } as any,
            subscriberKeyExchange: {
                requestGroupKey: async () => {}
            } as any,
            streamRegistryCached: {
                getStream: async () => stream,
                isStreamPublisher: async () => true,
                clearStream: () => {}
            } as any,
            streamrClientEventEmitter: undefined as any,
            destroySignal: new DestroySignal(context),
            rootConfig: {
                decryption: {
                    keyRequestTimeout: 50
                } as any
            } as any
        })
    })

    it('happy path', async () => {
        await input.push(await createMockMessage({
            publisher,
            streamPartId,
            content: CONTENT
        }))
        input.endWrite()
        const output = await collect(pipeline)
        expect(output).toHaveLength(1)
        expect(output[0].getParsedContent()).toEqual(CONTENT)
    })

    it('error: invalid signature', async () => {
        const msg = await createMockMessage({
            publisher,
            streamPartId,
            content: CONTENT
        })
        msg.signature = 'invalid-signature'
        await input.push(msg)
        input.endWrite()
        const onError = jest.fn()
        pipeline.onError.listen(onError)
        const output = await collect(pipeline)
        expect(onError).toBeCalledTimes(1)
        const error = onError.mock.calls[0][0]
        expect(error.message).toContain('Signature validation failed')
        expect(output).toEqual([])
    })

    it('error: invalid content', async () => {
        const msg = await createMockMessage({
            publisher,
            streamPartId
        })
        msg.serializedContent = '{ invalid-json'
        msg.signature = sign(msg.getPayloadToSign(StreamMessage.SIGNATURE_TYPES.ETH), publisher.privateKey)
        await input.push(msg)
        input.endWrite()
        const onError = jest.fn()
        pipeline.onError.listen(onError)
        const output = await collect(pipeline)
        expect(onError).toBeCalledTimes(1)
        const error = onError.mock.calls[0][0]
        expect(error.message).toContain('Invalid JSON')
        expect(output).toEqual([])
    })

    it('error: no encryption key available', async () => {
        const encryptionKey = GroupKey.generate()
        await input.push(await createMockMessage({
            publisher,
            streamPartId,
            content: CONTENT,
            encryptionKey
        }))
        input.endWrite()
        const onError = jest.fn()
        pipeline.onError.listen(onError)
        const output = await collect(pipeline)
        expect(onError).toBeCalledTimes(1)
        const error = onError.mock.calls[0][0]
        expect(error).toBeInstanceOf(DecryptError)
        expect(output).toEqual([])
    })
})
