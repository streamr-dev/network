import 'reflect-metadata'
import { container as rootContainer } from 'tsyringe'
import { StreamMessage, toStreamID } from 'streamr-client-protocol'
import { BrubeckNode, NetworkNodeStub } from '../../src/BrubeckNode'
import { Publisher } from '../../src/publish/Publisher'
import { initContainer } from '../../src/Container'
import { StreamRegistry } from '../../src/registry/StreamRegistry'
import { DEFAULT_PARTITION } from '../../src/StreamIDBuilder'
import { FakeStreamRegistry } from '../test-utils/fake/FakeStreamRegistry'
import { createStrictConfig } from '../../src/Config'
import { GroupKeyStoreFactory } from '../../src/encryption/GroupKeyStoreFactory'
import { GroupKey } from '../../src/encryption/GroupKey'

const AUTHENTICATED_USER = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'
const PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001'
const STREAM_ID = toStreamID('/path', AUTHENTICATED_USER)
const GROUP_KEY = GroupKey.generate()

const createMockContainer = async (
    brubeckNode: Pick<BrubeckNode, 'publishToNode'>,
) => {
    const config = createStrictConfig({
        auth: {
            privateKey: PRIVATE_KEY
        }
    })
    const groupKeyStoreFactory = {
        getStore: () => {
            return {
                useGroupKey: async () => [GROUP_KEY, undefined]
            }
        }
    }
    const childContainer = rootContainer.createChildContainer()
    initContainer(config, childContainer)
    return childContainer
        .registerSingleton(StreamRegistry, FakeStreamRegistry as any)
        .register(BrubeckNode, { useValue: brubeckNode as any })
        .register(GroupKeyStoreFactory, { useValue: groupKeyStoreFactory } as any)
}

describe('Publisher', () => {

    let publisher: Pick<Publisher, 'publish' | 'stop'>
    let brubeckNode: Pick<BrubeckNode, 'publishToNode' | 'getNode'>

    beforeEach(async () => {
        brubeckNode = {
            publishToNode: jest.fn(),
            getNode: async () => {
                return {
                    addMessageListener: jest.fn(),
                    subscribe: jest.fn()
                } as unknown as NetworkNodeStub
            } 
        }
        const mockContainer = await createMockContainer(brubeckNode)
        publisher = mockContainer.resolve(Publisher)
        const streamRegistry = mockContainer.resolve(StreamRegistry)
        await streamRegistry.createStream(STREAM_ID)
    })

    it('happy path', async () => {
        const testStartTime = Date.now()
        await publisher.publish(STREAM_ID, {
            foo: 'bar'
        })
        await publisher.stop()
        expect(brubeckNode.publishToNode).toBeCalledTimes(1)
        const actual = (brubeckNode.publishToNode as any).mock.calls[0][0]
        expect(actual).toMatchObject({
            contentType: 0,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.AES,
            groupKeyId: GROUP_KEY.id,
            messageId: {
                msgChainId: expect.anything(),
                publisherId: AUTHENTICATED_USER.toLowerCase(),
                sequenceNumber: 0,
                streamId: STREAM_ID,
                streamPartition: DEFAULT_PARTITION,
                timestamp: expect.toBeWithin(testStartTime, Date.now() + 1)
            },
            messageType: 27,
            newGroupKey: null,
            parsedContent: undefined,
            prevMsgRef: null,
            serializedContent: expect.anything(),
            signature: expect.anything(),
            signatureType: 2
        })
    })

    it('metadata', async () => {
        const TIMESTAMP = Date.parse('2001-02-03T04:05:06Z')
        const MSG_CHAIN_ID = 'mock-msgChainId'
        await publisher.publish(STREAM_ID, {
            foo: 'bar'
        }, {
            timestamp: TIMESTAMP,
            msgChainId: MSG_CHAIN_ID
        })
        await publisher.stop()
        expect(brubeckNode.publishToNode).toBeCalledTimes(1)
        const actual = (brubeckNode.publishToNode as any).mock.calls[0][0]
        expect(actual.messageId.timestamp).toBe(TIMESTAMP)
        expect(actual.messageId.msgChainId).toBe(MSG_CHAIN_ID)
    })

    it('partition and partitionKey', async () => {
        // eslint-disable-next-line max-len
        return expect(() => {
            return publisher.publish({
                streamId: STREAM_ID,
                partition: 0
            }, {
                foo: 'bar'
            }, {
                partitionKey: 'mockPartitionKey'
            })
        }).rejects.toThrow('Invalid combination of "partition" and "partitionKey"')
    })
})
