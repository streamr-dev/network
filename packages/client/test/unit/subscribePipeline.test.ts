import 'reflect-metadata'
import { GroupKey, GroupKeyId } from '../../src/encryption/GroupKey'
import { EncryptionType, MessageID, StreamMessage, StreamPartID, StreamPartIDUtils, toStreamID } from 'streamr-client-protocol'
import { Wallet } from '@ethersproject/wallet'
import { fastWallet, randomEthereumAddress } from "streamr-test-utils"
import { Subscription } from "../../src/subscribe/Subscription"
import { createSubscribePipeline } from "../../src/subscribe/subscribePipeline"
import { mockLoggerFactory } from '../test-utils/utils'
import { collect } from '../../src/utils/GeneratorUtils'
import { DecryptError, EncryptionUtil } from '../../src/encryption/EncryptionUtil'
import { Stream } from '../../src'
import { DestroySignal } from '../../src/DestroySignal'
import { createSignedMessage } from '../../src/publish/MessageFactory'
import { createAuthentication } from '../../src/Authentication'
import { StreamrClientEventEmitter } from '../../src/events'
import { toEthereumAddress } from '@streamr/utils'

const CONTENT = {
    foo: 'bar'
}

describe('subscribePipeline', () => {

    let pipeline: Subscription
    let streamPartId: StreamPartID
    let publisher: Wallet

    const createMessage = async (opts: {
        serializedContent?: string
        encryptionType?: EncryptionType
        groupKeyId?: GroupKeyId
    } = {}): Promise<StreamMessage<unknown>> => {
        const [streamId, partition] = StreamPartIDUtils.getStreamIDAndPartition(streamPartId)
        return createSignedMessage({
            messageId: new MessageID(
                streamId,
                partition,
                Date.now(),
                0,
                toEthereumAddress(publisher.address),
                'mock-msgChainId'
            ),
            serializedContent: JSON.stringify(CONTENT),
            authentication: createAuthentication({
                privateKey: publisher.privateKey
            }, undefined as any),
            ...opts
        })
    }

    beforeEach(async () => {
        streamPartId = StreamPartIDUtils.parse(`${randomEthereumAddress()}/path#0`)
        publisher = fastWallet()
        const stream = new Stream(
            {
                id: toStreamID(streamPartId),
                partitions: 1,
            },
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any
        )
        pipeline = createSubscribePipeline({
            streamPartId,
            loggerFactory: mockLoggerFactory(),
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
            streamrClientEventEmitter: new StreamrClientEventEmitter(),
            destroySignal: new DestroySignal(),
            rootConfig: {
                decryption: {
                    keyRequestTimeout: 50
                } as any
            } as any
        })
    })

    it('happy path', async () => {
        const msg = await createMessage()
        await pipeline.push(msg)
        pipeline.endWrite()
        const output = await collect(pipeline)
        expect(output).toHaveLength(1)
        expect(output[0].getParsedContent()).toEqual(CONTENT)
    })

    it('error: invalid signature', async () => {
        const msg = await createMessage()
        msg.signature = 'invalid-signature'
        await pipeline.push(msg)
        pipeline.endWrite()
        const onError = jest.fn()
        pipeline.onError.listen(onError)
        const output = await collect(pipeline)
        expect(onError).toBeCalledTimes(1)
        const error = onError.mock.calls[0][0]
        expect(error.message).toContain('Signature validation failed')
        expect(output).toEqual([])
    })

    it('error: invalid content', async () => {
        const msg = await createMessage({
            serializedContent: '{ invalid-json',
        })
        await pipeline.push(msg)
        pipeline.endWrite()
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
        const serializedContent = EncryptionUtil.encryptWithAES(Buffer.from(JSON.stringify(CONTENT), 'utf8'), encryptionKey.data)
        await pipeline.push(await createMessage({
            serializedContent,
            encryptionType: EncryptionType.AES,
            groupKeyId: encryptionKey.id
        }))
        pipeline.endWrite()
        const onError = jest.fn()
        pipeline.onError.listen(onError)
        const output = await collect(pipeline)
        expect(onError).toBeCalledTimes(1)
        const error = onError.mock.calls[0][0]
        expect(error).toBeInstanceOf(DecryptError)
        expect(error.message).toMatch(/timed out/)
        expect(output).toEqual([])
    })
})
