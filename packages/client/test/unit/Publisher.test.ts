import 'reflect-metadata'
import { container as rootContainer, DependencyContainer } from 'tsyringe'
import { StreamID, StreamMessage } from 'streamr-client-protocol'
import { NetworkNodeFacade, NetworkNodeStub } from '../../src/NetworkNodeFacade'
import { Publisher } from '../../src/publish/Publisher'
import { initContainer } from '../../src/Container'
import { StreamRegistry } from '../../src/registry/StreamRegistry'
import { DEFAULT_PARTITION } from '../../src/StreamIDBuilder'
import { FakeStreamRegistry } from '../test-utils/fake/FakeStreamRegistry'
import { createStrictConfig } from '../../src/Config'
import { GroupKeyStoreFactory } from '../../src/encryption/GroupKeyStoreFactory'
import { GroupKey } from '../../src/encryption/GroupKey'
import { createRelativeTestStreamId } from '../test-utils/utils'
import { StreamPermission } from '../../src/permission'
import { FakeChain } from '../test-utils/fake/FakeChain'

const AUTHENTICATED_USER = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'
const PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001'
const GROUP_KEY = GroupKey.generate()

const createMockContainer = async (
    networkNodeFacade: Pick<NetworkNodeFacade, 'publishToNode'>,
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
        .register(FakeChain, { useValue: new FakeChain() })
        .register(StreamRegistry, FakeStreamRegistry as any)
        .register(NetworkNodeFacade, { useValue: networkNodeFacade as any })
        .register(GroupKeyStoreFactory, { useValue: groupKeyStoreFactory } as any)
}

describe('Publisher', () => {

    let streamId: StreamID
    let publisher: Pick<Publisher, 'publish' | 'stop'>
    let networkNodeFacade: Pick<NetworkNodeFacade, 'publishToNode' | 'getNode'>
    let mockContainer: DependencyContainer

    beforeEach(async () => {
        networkNodeFacade = {
            publishToNode: jest.fn(),
            getNode: async () => {
                return {
                    addMessageListener: jest.fn(),
                    subscribe: jest.fn()
                } as unknown as NetworkNodeStub
            } 
        }
        mockContainer = await createMockContainer(networkNodeFacade)
        publisher = mockContainer.resolve(Publisher)
        const streamRegistry = mockContainer.resolve(StreamRegistry)
        const stream = await streamRegistry.createStream(createRelativeTestStreamId(module))
        streamId = stream.id
    })

    it('happy path', async () => {
        const testStartTime = Date.now()
        await publisher.publish(streamId, {
            foo: 'bar'
        })
        await publisher.stop()
        expect(networkNodeFacade.publishToNode).toBeCalledTimes(1)
        const actual = (networkNodeFacade.publishToNode as any).mock.calls[0][0]
        expect(actual).toMatchObject({
            contentType: 0,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.AES,
            groupKeyId: GROUP_KEY.id,
            messageId: {
                msgChainId: expect.anything(),
                publisherId: AUTHENTICATED_USER.toLowerCase(),
                sequenceNumber: 0,
                streamId,
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

    it('public stream', async () => {
        const streamRegistry = mockContainer.resolve(StreamRegistry)
        const publicStream = await streamRegistry.createStream(createRelativeTestStreamId(module))
        publicStream.grantPermissions({
            public: true,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        const CONTENT = {
            foo: 'bar'
        }
        await publisher.publish(publicStream, CONTENT)
        await publisher.stop()
        expect(networkNodeFacade.publishToNode).toBeCalledTimes(1)
        const actual = (networkNodeFacade.publishToNode as any).mock.calls[0][0]
        expect(actual).toMatchObject({
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            groupKeyId: null,
            serializedContent: JSON.stringify(CONTENT)
        })
    })

    it('metadata', async () => {
        const TIMESTAMP = Date.parse('2001-02-03T04:05:06Z')
        const MSG_CHAIN_ID = 'mock-msgChainId'
        await publisher.publish(streamId, {
            foo: 'bar'
        }, {
            timestamp: TIMESTAMP,
            msgChainId: MSG_CHAIN_ID
        })
        await publisher.stop()
        expect(networkNodeFacade.publishToNode).toBeCalledTimes(1)
        const actual = (networkNodeFacade.publishToNode as any).mock.calls[0][0]
        expect(actual.messageId.timestamp).toBe(TIMESTAMP)
        expect(actual.messageId.msgChainId).toBe(MSG_CHAIN_ID)
    })

    it('partition and partitionKey', async () => {
        // eslint-disable-next-line max-len
        return expect(() => {
            return publisher.publish({
                streamId,
                partition: 0
            }, {
                foo: 'bar'
            }, {
                partitionKey: 'mockPartitionKey'
            })
        }).rejects.toThrow('Invalid combination of "partition" and "partitionKey"')
    })
})
