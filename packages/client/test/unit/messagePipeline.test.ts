import 'reflect-metadata'

import { Wallet } from '@ethersproject/wallet'
import { EncryptionType, MessageID, StreamMessage, StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { fastWallet, randomEthereumAddress } from '@streamr/test-utils'
import { collect, toEthereumAddress } from '@streamr/utils'
import { mock } from 'jest-mock-extended'
import { createPrivateKeyAuthentication } from '../../src/Authentication'
import { StrictStreamrClientConfig } from '../../src/Config'
import { DestroySignal } from '../../src/DestroySignal'
import { Stream } from '../../src/Stream'
import { DecryptError, EncryptionUtil } from '../../src/encryption/EncryptionUtil'
import { GroupKeyManager } from '../../src/encryption/GroupKeyManager'
import { LitProtocolFacade } from '../../src/encryption/LitProtocolFacade'
import { SubscriberKeyExchange } from '../../src/encryption/SubscriberKeyExchange'
import { StreamrClientEventEmitter } from '../../src/events'
import { createSignedMessage } from '../../src/publish/MessageFactory'
import { StreamRegistryCached } from '../../src/registry/StreamRegistryCached'
import { createMessagePipeline } from "../../src/subscribe/messagePipeline"
import { mockLoggerFactory } from '../test-utils/utils'
import { GroupKey } from './../../src/encryption/GroupKey'
import { MessageStream } from './../../src/subscribe/MessageStream'

const CONTENT = {
    foo: 'bar'
}

describe('messagePipeline', () => {

    let pipeline: MessageStream
    let streamRegistryCached: Partial<StreamRegistryCached>
    let streamPartId: StreamPartID
    let publisher: Wallet

    const createMessage = async (opts: {
        serializedContent?: string
        encryptionType?: EncryptionType
        groupKeyId?: string
    } = {}): Promise<StreamMessage> => {
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
            authentication: createPrivateKeyAuthentication(publisher.privateKey, undefined as any),
            ...opts
        })
    }

    beforeEach(async () => {
        streamPartId = StreamPartIDUtils.parse(`${randomEthereumAddress()}/path#0`)
        publisher = fastWallet()
        const stream = new Stream(
            StreamPartIDUtils.getStreamID(streamPartId),
            {
                partitions: 1,
            },
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any
        )
        const groupKeyStore = {
            get: async () => undefined
        } as any
        const destroySignal = new DestroySignal()
        const config: Pick<StrictStreamrClientConfig, 'encryption'> = {
            encryption: {
                litProtocolEnabled: false,
                litProtocolLogging: false,
                keyRequestTimeout: 50,
                maxKeyRequestsPerSecond: 0
            }
        }
        streamRegistryCached = {
            getStream: async () => stream,
            isStreamPublisher: async () => true,
            clearStream: jest.fn()
        } 
        pipeline = createMessagePipeline({
            streamPartId,
            getStorageNodes: undefined as any,
            loggerFactory: mockLoggerFactory(),
            resends: undefined as any,
            groupKeyManager: new GroupKeyManager(
                groupKeyStore,
                mock<LitProtocolFacade>(),
                mock<SubscriberKeyExchange>(),
                new StreamrClientEventEmitter(),
                destroySignal,
                createPrivateKeyAuthentication(publisher.privateKey, {} as any),
                config
            ),
            streamRegistryCached: streamRegistryCached as any,
            destroySignal,
            config: config as any
        })
    })

    it('happy path', async () => {
        const msg = await createMessage()
        await pipeline.push(msg)
        pipeline.endWrite()
        const output = await collect(pipeline)
        expect(output).toHaveLength(1)
        expect(output[0].content).toEqual(CONTENT)
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
        expect(streamRegistryCached.clearStream).toBeCalledTimes(1)
        expect(streamRegistryCached.clearStream).toBeCalledWith(StreamPartIDUtils.getStreamID(streamPartId))
    })
})
