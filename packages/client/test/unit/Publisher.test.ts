import 'reflect-metadata'
import { DependencyContainer } from 'tsyringe'
import { MAX_PARTITION_COUNT, StreamMessage, toStreamID } from 'streamr-client-protocol'
import { Publisher } from '../../src/publish/Publisher'
import { StreamRegistry } from '../../src/registry/StreamRegistry'
import { GroupKeyStoreFactory } from '../../src/encryption/GroupKeyStoreFactory'
import { GroupKey } from '../../src/encryption/GroupKey'
import { createRelativeTestStreamId } from '../test-utils/utils'
import { Stream } from '../../src/Stream'
import { Wallet } from '@ethersproject/wallet'
import { fastWallet } from 'streamr-test-utils'
import { addFakeNode, createFakeContainer } from '../test-utils/fake/fakeEnvironment'
import { StreamPermission } from '../../src'
import { nextValue } from '../../src/utils/iterators'
import { FakeBrubeckNode } from '../test-utils/fake/FakeBrubeckNode'
import { random } from 'lodash'

const PARTITION_COUNT = 100
const GROUP_KEY = GroupKey.generate()

describe('Publisher', () => {

    let publisher: Publisher
    let publisherWallet: Wallet
    let subscriberWallet: Wallet
    let subscriberNode: FakeBrubeckNode
    let receivedMessages: AsyncIterableIterator<StreamMessage>
    let stream: Stream
    let dependencyContainer: DependencyContainer

    beforeEach(async () => {
        publisherWallet = fastWallet()
        const streamId = toStreamID('/path', publisherWallet.address)
        dependencyContainer = createFakeContainer({
            auth: {
                privateKey: publisherWallet.privateKey
            },
            encryptionKeys: {
                [streamId]: {
                    [GROUP_KEY.id]: GROUP_KEY
                }
            }
        })
        publisher = dependencyContainer.resolve(Publisher)
        const streamRegistry = dependencyContainer.resolve(StreamRegistry)
        stream = await streamRegistry.createStream({
            id: streamId,
            partitions: PARTITION_COUNT
        })
        const groupKeyStore = await dependencyContainer.resolve(GroupKeyStoreFactory).getStore(stream.id)
        await groupKeyStore.add(GROUP_KEY)
        subscriberWallet = fastWallet()
        streamRegistry.grantPermissions(stream.id, {
            user: subscriberWallet.address,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        subscriberNode = addFakeNode(subscriberWallet.address, dependencyContainer)
        receivedMessages = subscriberNode.addSubscriber(...stream.getStreamParts())
    })

    it('happy path', async () => {
        const testStartTime = Date.now()
        await stream.publish({
            foo: 'bar'
        })
        const receivedMessage = await nextValue(receivedMessages)
        expect(receivedMessage).toMatchObject({
            contentType: 0,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.AES,
            groupKeyId: GROUP_KEY.id,
            messageId: {
                msgChainId: expect.anything(),
                publisherId: publisherWallet.address.toLowerCase(),
                sequenceNumber: 0,
                streamId: stream.id,
                streamPartition: expect.toBeWithin(0, MAX_PARTITION_COUNT),
                timestamp: expect.toBeWithin(testStartTime, Date.now() + 1)
            },
            messageType: 27,
            newGroupKey: null,
            prevMsgRef: null,
            serializedContent: expect.anything(),
            signature: expect.anything(),
            signatureType: 2
        })
    })

    it('metadata', async () => {
        const TIMESTAMP = Date.parse('2001-02-03T04:05:06Z')
        const MSG_CHAIN_ID = 'mock-msgChainId'
        await stream.publish({
            foo: 'bar'
        }, {
            timestamp: TIMESTAMP,
            msgChainId: MSG_CHAIN_ID
        })
        const receivedMessage = await nextValue(receivedMessages)
        expect(receivedMessage!.messageId.timestamp).toBe(TIMESTAMP)
        expect(receivedMessage!.messageId.msgChainId).toBe(MSG_CHAIN_ID)
    })

    // TODO could maybe test these by calling MessageFactory.createMessage directly
    describe('partitions', () => {
        it('partition and partitionKey', async () => {
            // eslint-disable-next-line max-len
            return expect(() => {
                return publisher.publish({
                    streamId: stream.id,
                    partition: 0
                }, {
                    foo: 'bar'
                }, {
                    partitionKey: 'mockPartitionKey'
                })
            }).rejects.toThrow('Invalid combination of "partition" and "partitionKey"')
        })

        it('no partition key: uses same partition for each publish', async () => {
            await stream.publish({
                foo: 'mock-1'
            })
            await stream.publish({
                foo: 'mock-2'
            })
            const msg1 = await nextValue(receivedMessages)
            const msg2 = await nextValue(receivedMessages)
            expect(msg1!.messageId.streamPartition).toBe(msg2!.messageId.streamPartition)
        })

        it('no partition key: different partition for different stream', async () => {
            await publisher.publish(stream.id, {
                foo: 'mock-1'
            })
            const msg1 = await nextValue(receivedMessages)
            let msg2: StreamMessage
            do {
                const streamRegistry = dependencyContainer.resolve(StreamRegistry)
                const otherStream = await streamRegistry.createStream({
                    id: createRelativeTestStreamId(module),
                    partitions: PARTITION_COUNT
                })
                streamRegistry.grantPermissions(otherStream.id, {
                    user: subscriberWallet.address,
                    permissions: [StreamPermission.SUBSCRIBE]
                })
                const otherStreamMessages = subscriberNode.addSubscriber(...otherStream.getStreamParts())
                await publisher.publish(otherStream.id, {
                    foo: 'mock-2'
                })
                msg2 = (await nextValue(otherStreamMessages))!
                // we can publish to the same random partition, but eventually we'll publish to some other partition
            } while (msg1!.messageId.streamPartition === msg2!.messageId.streamPartition)
        })

        it('random partition keys map to full partition range', async () => {
            const foundPartitions: Set<number> = new Set()
            do {
                await stream.publish({
                    foo: 'mock'
                }, {
                    partitionKey: `mock-partition-key-${random(Number.MAX_SAFE_INTEGER)}`
                })
                const msg = await nextValue(receivedMessages)
                foundPartitions.add(msg!.messageId.streamPartition)
            } while (foundPartitions.size < PARTITION_COUNT)
        })

        it('same partition key maps to same partition', async () => {
            const partitionKey = `mock-partition-key-${random(Number.MAX_SAFE_INTEGER)}`
            await stream.publish({
                foo: 'mock-1'
            }, {
                partitionKey
            })
            await stream.publish({
                foo: 'mock-2'
            }, {
                partitionKey
            })
            const msg1 = await nextValue(receivedMessages)
            const msg2 = await nextValue(receivedMessages)
            expect(msg1!.messageId.streamPartition).toBe(msg2!.messageId.streamPartition)
        })

        it('numeric partition key maps to the partition if in range', async () => {
            const partitionKey = 10
            await stream.publish({
                foo: 'mock-1'
            }, {
                partitionKey
            })
            const msg = await nextValue(receivedMessages)
            expect(msg!.messageId.streamPartition).toBe(partitionKey)
        })

        it('numeric partition key maps to partition range', async () => {
            const partitionOffset = 20
            await stream.publish({
                foo: 'mock-1'
            }, {
                partitionKey: PARTITION_COUNT + partitionOffset
            })
            const msg = await nextValue(receivedMessages)
            expect(msg!.messageId.streamPartition).toBe(partitionOffset)
        })
    })
})
