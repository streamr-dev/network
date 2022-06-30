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
import { STREAM_CLIENT_DEFAULTS } from '../../src/Config'
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

    let resends: Resends
    let subscriberWallet = fastWallet()
    let publisherWallet = fastWallet()
    let stream: Stream
    let dependencyContainer: DependencyContainer
    let KEY_ORIGINAL: GroupKey
    let KEY_ROTATED: GroupKey
    let KEY_REKEYED: GroupKey
    let ALL_MESSAGES: { timestamp: number, groupKey: GroupKey, nextGroupKey?: GroupKey }[]

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
        const expectedTimestamps = ALL_MESSAGES.map((m) => m.timestamp).filter((ts) => ts >= fromTimestamp && ts <= toTimestamp)
        expect(messages.map(m => m.getTimestamp())).toEqual(expectedTimestamps)
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
            _timeouts: {
                ...STREAM_CLIENT_DEFAULTS._timeouts,
                encryptionKeyRequest: 50
            }
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
        KEY_ORIGINAL = GroupKey.generate()
        KEY_ROTATED = GroupKey.generate()
        KEY_REKEYED = GroupKey.generate()
        ALL_MESSAGES = [
            { timestamp: 1000, groupKey: KEY_ORIGINAL},
            { timestamp: 2000, groupKey: KEY_ORIGINAL, nextGroupKey: KEY_ROTATED },
            { timestamp: 3000, groupKey: KEY_ROTATED },
            { timestamp: 4000, groupKey: KEY_ROTATED },
            { timestamp: 5000, groupKey: KEY_REKEYED },
            { timestamp: 6000, groupKey: KEY_REKEYED }
        ]
        for (const msg of ALL_MESSAGES) {
            storeMessage(msg.timestamp, msg.groupKey, msg.nextGroupKey)
        }
        resends = dependencyContainer.resolve(Resends)
    })

    describe('no keys available', () => {
        it('can\'t decrypt', async () => {
            await assertNonDecryptable(1000, 6000)
        })
    })

    describe('original key available', () => {
        beforeEach(async () => {
            const keyStore = await dependencyContainer.resolve(GroupKeyStoreFactory).getStore(stream.id)
            await keyStore.add(KEY_ORIGINAL)
        })
        it('can decrypt original', async () => {
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
            await keyStore.add(KEY_ROTATED)
        })
        it('can\'t decrypt original', async () => {
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
            await keyStore.add(KEY_REKEYED)
        })
        it('can\'t decrypt original', async () => {
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