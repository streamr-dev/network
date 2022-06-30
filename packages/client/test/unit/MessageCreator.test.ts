import 'reflect-metadata'
import { EthereumAddress, StreamMessage, toStreamID } from 'streamr-client-protocol'
import { Authentication } from '../../src/Authentication'
import { MessageCreateOptions, MessageCreator } from '../../src/publish/MessageCreator'
import { StreamPartitioner } from '../../src/publish/StreamPartitioner'

const MOCK_STREAM_ID = toStreamID('mock-stream-id')
const MOCK_STREAM_PARTITION = 50
const MOCK_CONTENT = { foo: 'bar' }
const MOCK_TIMESTAMP = 1234567890
const MOCK_USER_ADDRESS = '0xAbcdeabCDE123456789012345678901234567890'

describe('MessageCreator', () => {

    let creator: MessageCreator
    let streamPartitioner: Pick<StreamPartitioner, 'compute'>

    const createMockMessage = async (
        opts: Omit<MessageCreateOptions<any>, 'content' | 'timestamp'> = {}
    ) => {
        return await creator.create(MOCK_STREAM_ID, {
            content: MOCK_CONTENT,
            timestamp: MOCK_TIMESTAMP,
            ...opts
        })
    }

    beforeEach(() => {
        streamPartitioner = {
            compute: jest.fn().mockResolvedValue(MOCK_STREAM_PARTITION)
        }
        const authentication: Pick<Authentication, 'getAddress'> = {
            getAddress: async (): Promise<EthereumAddress> => {
                return MOCK_USER_ADDRESS
            }
        }
        creator = new MessageCreator(
            streamPartitioner as any, 
            authentication as any,
            {
                maxSize: 1,
                maxAge: 0
            }
        )
    })

    afterEach(async () => {
        await creator.stop()
    })

    it('happy path', async () => {
        const msg = await createMockMessage()
        expect(msg).toEqual({
            contentType: StreamMessage.CONTENT_TYPES.JSON,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            groupKeyId: null,
            messageId: {
                msgChainId: expect.any(String),
                publisherId: MOCK_USER_ADDRESS.toLowerCase(),
                sequenceNumber: 0,
                streamId: MOCK_STREAM_ID,
                streamPartition: MOCK_STREAM_PARTITION,
                timestamp: MOCK_TIMESTAMP,
            },
            messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
            newGroupKey: null,
            parsedContent: MOCK_CONTENT,
            prevMsgRef: null,
            serializedContent: JSON.stringify(MOCK_CONTENT),
            signature: null,
            signatureType: StreamMessage.SIGNATURE_TYPES.NONE
        })
        expect(streamPartitioner.compute).toHaveBeenCalledWith(MOCK_STREAM_ID, undefined)
    })

    it('options', async () => {
        const partitionKey = 'mock-partition-key'
        const msgChainId = 'mock-msg-chain-id'
        const messageType = StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST
        const encryptionType = StreamMessage.ENCRYPTION_TYPES.RSA
        const msg = await createMockMessage({
            partitionKey,
            msgChainId,
            messageType,
            encryptionType
        })
        expect(msg).toMatchObject({
            encryptionType,
            messageId: {
                msgChainId,
                streamPartition: MOCK_STREAM_PARTITION
            },
            messageType
        })
        expect(streamPartitioner.compute).toHaveBeenCalledWith(MOCK_STREAM_ID, partitionKey)
    })

    it('chaining', async () => {
        const msg1 = await createMockMessage()
        const msg2 = await createMockMessage()
        expect(msg1.getMessageID().msgChainId).toBe(msg2.getMessageID().msgChainId)
        expect(msg2.getPreviousMessageRef()).toEqual(msg1.getMessageRef())
    })
})
