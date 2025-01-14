import 'reflect-metadata'

import { fastWallet, randomEthereumAddress } from '@streamr/test-utils'
import { StreamPartID, StreamPartIDUtils, collect, hexToBinary, toUserId, utf8ToBinary } from '@streamr/utils'
import { Wallet } from 'ethers'
import { mock } from 'jest-mock-extended'
import { createPrivateKeyAuthentication } from '../../src/Authentication'
import { StrictStreamrClientConfig } from '../../src/Config'
import { DestroySignal } from '../../src/DestroySignal'
import { ERC1271ContractFacade } from '../../src/contracts/ERC1271ContractFacade'
import { StreamRegistry } from '../../src/contracts/StreamRegistry'
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'
import { GroupKey } from '../../src/encryption/GroupKey'
import { GroupKeyManager } from '../../src/encryption/GroupKeyManager'
import { LitProtocolFacade } from '../../src/encryption/LitProtocolFacade'
import { SubscriberKeyExchange } from '../../src/encryption/SubscriberKeyExchange'
import { StreamrClientEventEmitter } from '../../src/events'
import { MessageSigner } from '../../src/signature/MessageSigner'
import { SignatureValidator } from '../../src/signature/SignatureValidator'
import { createMessagePipeline } from '../../src/subscribe/messagePipeline'
import { PushPipeline } from '../../src/utils/PushPipeline'
import { mockLoggerFactory } from '../test-utils/utils'
import { MessageID } from './../../src/protocol/MessageID'
import {
    ContentType,
    EncryptionType,
    SignatureType,
    StreamMessage,
    StreamMessageType
} from './../../src/protocol/StreamMessage'

const CONTENT = {
    foo: 'bar'
}

describe('messagePipeline', () => {
    let pipeline: PushPipeline<StreamMessage, StreamMessage>
    let streamRegistry: Partial<StreamRegistry>
    let streamPartId: StreamPartID
    let publisher: Wallet

    const createMessage = async (
        opts: {
            content?: Uint8Array
            encryptionType?: EncryptionType
            groupKeyId?: string
            contentType?: ContentType
        } = {}
    ): Promise<StreamMessage> => {
        const [streamId, partition] = StreamPartIDUtils.getStreamIDAndPartition(streamPartId)
        const messageSigner = new MessageSigner(createPrivateKeyAuthentication(publisher.privateKey))
        return messageSigner.createSignedMessage(
            {
                messageId: new MessageID(
                    streamId,
                    partition,
                    Date.now(),
                    0,
                    toUserId(publisher.address),
                    'mock-msgChainId'
                ),
                messageType: StreamMessageType.MESSAGE,
                content:
                    opts.contentType === ContentType.BINARY ? opts.content! : utf8ToBinary(JSON.stringify(CONTENT)),
                contentType: opts.contentType ?? ContentType.JSON,
                encryptionType: EncryptionType.NONE,
                ...opts
            },
            SignatureType.SECP256K1
        )
    }

    beforeEach(async () => {
        streamPartId = StreamPartIDUtils.parse(`${randomEthereumAddress()}/path#0`)
        publisher = fastWallet()
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
            } as any
        }
        streamRegistry = {
            getStreamMetadata: async () => ({ partitions: 1 }),
            isStreamPublisher: async () => true,
            invalidatePermissionCaches: jest.fn()
        }
        pipeline = createMessagePipeline({
            streamPartId,
            getStorageNodes: undefined as any,
            resends: undefined as any,
            streamRegistry: streamRegistry as any,
            signatureValidator: new SignatureValidator(mock<ERC1271ContractFacade>()),
            groupKeyManager: new GroupKeyManager(
                mock<SubscriberKeyExchange>(),
                mock<LitProtocolFacade>(),
                groupKeyStore,
                config,
                createPrivateKeyAuthentication(publisher.privateKey),
                new StreamrClientEventEmitter(),
                destroySignal
            ),
            config: config as any,
            destroySignal,
            loggerFactory: mockLoggerFactory()
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

    it('binary content', async () => {
        const content = new Uint8Array([1, 2, 3])
        const msg = await createMessage({
            content: content,
            contentType: ContentType.BINARY
        })
        await pipeline.push(msg)
        pipeline.endWrite()
        const output = await collect(pipeline)
        expect(output).toHaveLength(1)
        expect(output[0].getParsedContent()).toEqual(content)
    })

    it('error: invalid signature', async () => {
        const originalMsg = await createMessage()
        const msg = new StreamMessage({
            ...originalMsg,
            signature: hexToBinary('0x111111')
        })
        await pipeline.push(msg)
        pipeline.endWrite()
        const onError = jest.fn()
        pipeline.onError.listen(onError)
        const output = await collect(pipeline)
        expect(onError).toHaveBeenCalledTimes(1)
        const error = onError.mock.calls[0][0]
        expect(error).toEqualStreamrClientError({
            code: 'INVALID_SIGNATURE',
            message: 'Signature validation failed'
        })
        expect(output).toEqual([])
    })

    it('error: invalid content', async () => {
        const msg = await createMessage({
            content: utf8ToBinary('{ invalid-json')
        })
        await pipeline.push(msg)
        pipeline.endWrite()
        const onError = jest.fn()
        pipeline.onError.listen(onError)
        const output = await collect(pipeline)
        expect(onError).toHaveBeenCalledTimes(1)
        const error = onError.mock.calls[0][0]
        expect(error).toEqualStreamrClientError({
            code: 'INVALID_MESSAGE_CONTENT',
            message: 'Unable to parse JSON'
        })
        expect(output).toEqual([])
    })

    it('error: no encryption key available', async () => {
        const encryptionKey = GroupKey.generate()
        const content = EncryptionUtil.encryptWithAES(Buffer.from(JSON.stringify(CONTENT), 'utf8'), encryptionKey.data)
        await pipeline.push(
            await createMessage({
                content,
                encryptionType: EncryptionType.AES,
                groupKeyId: encryptionKey.id
            })
        )
        pipeline.endWrite()
        const onError = jest.fn()
        pipeline.onError.listen(onError)
        const output = await collect(pipeline)
        expect(onError).toHaveBeenCalledTimes(1)
        const error = onError.mock.calls[0][0]
        expect(error).toEqualStreamrClientError({
            code: 'DECRYPT_ERROR',
            message: 'Could not get encryption key'
        })
        expect(output).toEqual([])
        expect(streamRegistry.invalidatePermissionCaches).toHaveBeenCalledTimes(1)
        expect(streamRegistry.invalidatePermissionCaches).toHaveBeenCalledWith(
            StreamPartIDUtils.getStreamID(streamPartId)
        )
    })

    it('error: exception', async () => {
        const err = new Error('mock-error')
        const msg = await createMessage()
        await pipeline.push(msg)
        pipeline.endWrite(err)
        const onError = jest.fn()
        pipeline.onError.listen(onError)
        const output = await collect(pipeline)
        expect(output).toHaveLength(1)
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(err)
    })
})
