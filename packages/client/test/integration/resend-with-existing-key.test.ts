import 'reflect-metadata'
import { toStreamID } from 'streamr-client-protocol'
import { GroupKey } from '../../src/encryption/GroupKey'
import { createMockMessage, createRelativeTestStreamId, getGroupKeyStore } from '../test-utils/utils'
import { Stream } from '../../src/Stream'
import { fastWallet } from 'streamr-test-utils'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { StreamPermission } from '../../src/permission'
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'
import { collect } from '../../src/utils/GeneratorUtils'
import { FakeStorageNode } from '../test-utils/fake/FakeStorageNode'
import { StreamrClient } from '../../src/StreamrClient'

/*
 * A subscriber has some GroupKeys in the local store and reads historical data
 * which is encrypted with those keys (or rotated keys). The publisher is offline
 * and therefore the subscriber can't get keys from it (all GroupKeyRequests timeout).
 */
describe('resend with existing key', () => {

    const subscriberWallet = fastWallet()
    const publisherWallet = fastWallet()
    let subscriber: StreamrClient
    let stream: Stream
    let initialKey: GroupKey
    let rotatedKey: GroupKey
    let rekeyedKey: GroupKey
    let allMessages: { timestamp: number, groupKey: GroupKey, nextGroupKey?: GroupKey }[]
    let environment: FakeEnvironment

    const storeMessage = (timestamp: number, currentGroupKey: GroupKey, nextGroupKey: GroupKey | undefined, storageNode: FakeStorageNode) => {
        const message = createMockMessage({
            timestamp,
            encryptionKey: currentGroupKey,
            newGroupKey: (nextGroupKey !== undefined) ? EncryptionUtil.encryptGroupKey(nextGroupKey, currentGroupKey) : null,
            stream,
            publisher: publisherWallet,
        })
        storageNode.storeMessage(message)
    }

    const resendRange = (fromTimestamp: number, toTimestamp: number) => {
        return subscriber.resend(stream.getStreamParts()[0], {
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
        const onError = jest.fn()
        messageStream.onError.listen(onError)
        const messages = await collect(messageStream)
        expect(onError).not.toBeCalled()
        const expectedTimestamps = allMessages.map((m) => m.timestamp).filter((ts) => ts >= fromTimestamp && ts <= toTimestamp)
        expect(messages.map((m) => m.getTimestamp())).toEqual(expectedTimestamps)
    }

    const assertNonDecryptable = async (fromTimestamp: number, toTimestamp: number) => {
        const messageStream = await resendRange(fromTimestamp, toTimestamp)
        const onError = jest.fn()
        messageStream.onError.listen(onError)
        await collect(messageStream)
        expect(onError).toBeCalled()
        const error = onError.mock.calls[0][0]
        expect(error.message).toContain('Unable to decrypt')
    }

    beforeEach(async () => {
        const streamId = toStreamID(createRelativeTestStreamId(module), publisherWallet.address)
        environment = new FakeEnvironment()
        subscriber = environment.createClient({
            auth: {
                privateKey: subscriberWallet.privateKey
            },
            // eslint-disable-next-line no-underscore-dangle
            _timeouts: {
                encryptionKeyRequest: 50
            } as any
        })
        stream = await subscriber.createStream({
            id: streamId
        })
        await stream.grantPermissions({
            user: publisherWallet.address,
            permissions: [StreamPermission.PUBLISH]
        })
        const storageNode = environment.startStorageNode()
        await subscriber.addStreamToStorageNode(stream.id, storageNode.id)
        initialKey = GroupKey.generate()
        rotatedKey = GroupKey.generate()
        rekeyedKey = GroupKey.generate()
        allMessages = [
            { timestamp: 1000, groupKey: initialKey },
            { timestamp: 2000, groupKey: initialKey, nextGroupKey: rotatedKey },
            { timestamp: 3000, groupKey: rotatedKey },
            { timestamp: 4000, groupKey: rotatedKey },
            { timestamp: 5000, groupKey: rekeyedKey },
            { timestamp: 6000, groupKey: rekeyedKey }
        ]
        for (const msg of allMessages) {
            storeMessage(msg.timestamp, msg.groupKey, msg.nextGroupKey, storageNode)
        }
    })

    afterEach(async () => {
        await environment.destroy()
    })

    describe('no keys available', () => {
        it('can\'t decrypt', async () => {
            await assertNonDecryptable(1000, 6000)
        })
    })

    describe('initial key available', () => {
        beforeEach(async () => {
            await getGroupKeyStore(stream.id, await subscriber.getAddress()).add(initialKey)
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
            await getGroupKeyStore(stream.id, await subscriber.getAddress()).add(rotatedKey)
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
            await getGroupKeyStore(stream.id, await subscriber.getAddress()).add(rekeyedKey)
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
