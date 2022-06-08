import 'reflect-metadata'
import { EthereumAddress, StreamMessage, toStreamID } from 'streamr-client-protocol'
import { Ethereum } from '../../src/Ethereum'
import { MessageCreator } from '../../src/publish/MessageCreator'
import { StreamPartitioner } from '../../src/publish/StreamPartitioner'

const MOCK_STREAM_ID = 'mock-stream-id'
const MOCK_STREAM_PARTITION = 50
const MOCK_CONTENT = { foo: 'bar' }
const MOCK_TIMESTAMP = 1234567890
const MOCK_USER_ADDRESS = '0xAbcdeabCDE123456789012345678901234567890'

const createMockMessageCreator = () => {
    const streamPartitioner: Pick<StreamPartitioner, 'compute' | 'clear'> = {
        compute: async (): Promise<number> => {
            return MOCK_STREAM_PARTITION
        },
        clear: () => {}
    }
    const ethereum: Pick<Ethereum, 'getAddress'> = {
        getAddress: async (): Promise<EthereumAddress> => {
            return MOCK_USER_ADDRESS
        }
    }
    return new MessageCreator(
        streamPartitioner as any, 
        ethereum as any,
        {
            maxSize: 1,
            maxAge: 0
        }
    )
}

const createMockMessage = async (streamId: string, partitionKey?: string) => {
    const creator = createMockMessageCreator()
    const result = await creator.create(toStreamID(streamId), {
        content: MOCK_CONTENT,
        timestamp: MOCK_TIMESTAMP,
        partitionKey
    })
    creator.stop()
    return result
}

describe('MessageCreator', () => {

    it('happy path', async () => {
        const msg = await createMockMessage(MOCK_STREAM_ID, undefined)
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
    })

    it('chaining', async () => {
        const creator = createMockMessageCreator()
        const msg1 = await creator.create(toStreamID(MOCK_STREAM_ID), {
            content: MOCK_CONTENT,
            timestamp: MOCK_TIMESTAMP
        })
        const msg2 = await creator.create(toStreamID(MOCK_STREAM_ID), {
            content: MOCK_CONTENT,
            timestamp: MOCK_TIMESTAMP
        })
        expect(msg1.getMessageID().msgChainId).toBe(msg2.getMessageID().msgChainId)
        expect(msg2.getPreviousMessageRef()).toEqual(msg1.getMessageRef())
        creator.stop()
    })
})
