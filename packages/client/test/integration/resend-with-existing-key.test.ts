import 'reflect-metadata'
import { DependencyContainer } from 'tsyringe'
import { toStreamID } from 'streamr-client-protocol'
import { StreamRegistry } from '../../src/registry/StreamRegistry'
import { GroupKeyStoreFactory } from '../../src/encryption/GroupKeyStoreFactory'
import { GroupKey } from '../../src/encryption/GroupKey'
import { createMockMessage, createRelativeTestStreamId } from '../test-utils/utils'
import { Stream } from '../../src/Stream'
import { fastWallet } from 'streamr-test-utils'
import { createFakeContainer } from '../test-utils/fake/fakeEnvironment'
import { StreamPermission } from '../../src/permission'
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'
import { StorageNodeRegistry } from '../../src/registry/StorageNodeRegistry'
import { DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'
import { Resends } from '../../src/subscribe/Resends'
import { collect } from '../../src/utils/GeneratorUtils'
import { FakeStorageNode } from '../test-utils/fake/FakeStorageNode'
import { ActiveNodes } from '../test-utils/fake/ActiveNodes'

/*
 * A subscriber has some GroupKeys in the local store and reads historical data 
 * which is encrypted with those keys (or rotated keys). The publisher is offline 
 * and therefore the subscriber can't get keys from it (all GroupKeyRequests timeout).
 */
describe('resend with existing key', () => {

    const subscriberWallet = fastWallet()
    const publisherWallet = fastWallet()
    let resends: Resends
    let stream: Stream
    let initialKey: GroupKey
    let rotatedKey: GroupKey
    let rekeydKey: GroupKey
    let allMessages: { timestamp: number, groupKey: GroupKey, nextGroupKey?: GroupKey }[]
    let dependencyContainer: DependencyContainer

    const storeMessage = (timestamp: number, currentGroupKey: GroupKey, nextGroupKey?: GroupKey) => {
        const message = createMockMessage({
            timestamp,
            encryptionKey: currentGroupKey,
            newGroupKey: (nextGroupKey !== undefined) ? EncryptionUtil.encryptGroupKey(nextGroupKey, currentGroupKey) : null,
            stream,
            publisher: publisherWallet,
        })
        const storageNode = dependencyContainer.resolve(ActiveNodes).getNode(DOCKER_DEV_STORAGE_NODE) as FakeStorageNode
        storageNode.storeMessage(message)
    }

    const resendRange = (fromTimestamp: number, toTimestamp: number) => {
        return resends.resend(stream.getStreamParts()[0], {
            from: {
                timestamp: fromTimestamp
            },
            to: {
                timestamp: toTimestamp
            }
        })
    }

    const assertDecryptable = async (fromTimestamp: number, toTimestamp: number) => {
        const messageStream = await resendRange(fromTimestamp, toTimestamp)
        const messages = await collect(messageStream)
        const expectedTimestamps = allMessages.map((m) => m.timestamp).filter((ts) => ts >= fromTimestamp && ts <= toTimestamp)
        expect(messages.map((m) => m.getTimestamp())).toEqual(expectedTimestamps)
    }

    const assertNonDecryptable = async (fromTimestamp: number, toTimestamp: number) => {
        const messageStream = await resendRange(fromTimestamp, toTimestamp)
        await expect(() => collect(messageStream)).rejects.toThrowError('Unable to decrypt')
    }

    beforeEach(async () => {
        const streamId = toStreamID(createRelativeTestStreamId(module), publisherWallet.address)
        dependencyContainer = createFakeContainer({
            auth: {
                privateKey: subscriberWallet.privateKey
            },
            // eslint-disable-next-line no-underscore-dangle
            _timeouts: {
                encryptionKeyRequest: 50
            } as any
        })
        const streamRegistry = dependencyContainer.resolve(StreamRegistry)
        stream = await streamRegistry.createStream({
            id: streamId
        })
        await stream.grantPermissions({
            user: publisherWallet.address,
            permissions: [StreamPermission.PUBLISH]
        })
        const storageNodeRegistry = dependencyContainer.resolve(StorageNodeRegistry)
        storageNodeRegistry.addStreamToStorageNode(stream.id, DOCKER_DEV_STORAGE_NODE)
        initialKey = GroupKey.generate()
        rotatedKey = GroupKey.generate()
        rekeydKey = GroupKey.generate()
        allMessages = [
            { timestamp: 1000, groupKey: initialKey},
            { timestamp: 2000, groupKey: initialKey, nextGroupKey: rotatedKey },
            { timestamp: 3000, groupKey: rotatedKey },
            { timestamp: 4000, groupKey: rotatedKey },
            { timestamp: 5000, groupKey: rekeydKey },
            { timestamp: 6000, groupKey: rekeydKey }
        ]
        for (const msg of allMessages) {
            storeMessage(msg.timestamp, msg.groupKey, msg.nextGroupKey)
        }
        resends = dependencyContainer.resolve(Resends)
    })

    describe('no keys available', () => {
        it('can\'t decrypt', async () => {
            await assertNonDecryptable(1000, 6000)
        })
    })

    describe('initial key available', () => {
        beforeEach(async () => {
            const keyStore = await dependencyContainer.resolve(GroupKeyStoreFactory).getStore(stream.id)
            await keyStore.add(initialKey)
        })
        it('can decrypt initial', async () => {
            await assertDecryptable(1000, 2000)
        })
        it('can decrypt rotated, if key rotation message is included', async () => {
            await assertDecryptable(2000, 4000)
        })
        it('can\'t decrypt rotated, if key rotation message is not included', async () => {
            await assertNonDecryptable(3000, 4000)
        })
        it('can\'t decrypt rekeyed', async () => {
            await assertNonDecryptable(5000, 6000)
        })
    })

    describe('rotated key available', () => {
        beforeEach(async () => {
            const keyStore = await dependencyContainer.resolve(GroupKeyStoreFactory).getStore(stream.id)
            await keyStore.add(rotatedKey)
        })
        it('can\'t decrypt initial', async () => {
            await assertNonDecryptable(1000, 2000)
        })
        it('can decrypt rotated', async () => {
            await assertDecryptable(3000, 4000)
        })
        it('can\'t decrypt rekeyed', async () => {
            await assertNonDecryptable(5000, 6000)
        })
    })

    describe('rekeyed key available', () => {
        beforeEach(async () => {
            const keyStore = await dependencyContainer.resolve(GroupKeyStoreFactory).getStore(stream.id)
            await keyStore.add(rekeydKey)
        })
        it('can\'t decrypt initial', async () => {
            await assertNonDecryptable(1000, 2000)
        })
        it('can\'t decrypt rotated', async () => {
            await assertNonDecryptable(3000, 4000)
        })
        it('can decrypt rekeyed', async () => {
            await assertDecryptable(5000, 6000)
        })
    })
})