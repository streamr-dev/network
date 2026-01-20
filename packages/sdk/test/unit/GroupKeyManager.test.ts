import { createTestWallet, randomUserId } from '@streamr/test-utils'
import { toStreamID, toStreamPartID, toUserId } from '@streamr/utils'
import { Wallet } from 'ethers'
import { mock, MockProxy } from 'jest-mock-extended'
import { DestroySignal } from '../../src/DestroySignal'
import { GroupKey } from '../../src/encryption/GroupKey'
import { GroupKeyManager } from '../../src/encryption/GroupKeyManager'
import { LocalGroupKeyStore } from '../../src/encryption/LocalGroupKeyStore'
import { SubscriberKeyExchange } from '../../src/encryption/SubscriberKeyExchange'
import { StreamrClientEventEmitter } from '../../src/events'
import { EthereumKeyPairIdentity } from '../../src/identity/EthereumKeyPairIdentity'
import { StreamIDBuilder } from '../../src/StreamIDBuilder'

const STREAM_ID = toStreamID('test.eth/foobar')
const GROUP_KEY = GroupKey.generate('groupKeyId-123')

describe('GroupKeyManager', () => {

    let groupKeyStore: MockProxy<LocalGroupKeyStore>
    let subscriberKeyExchange: MockProxy<SubscriberKeyExchange>
    let eventEmitter: StreamrClientEventEmitter
    let groupKeyManager: GroupKeyManager
    let wallet: Wallet

    const getUserId = () => toUserId(wallet.address)

    function createGroupKeyManager(): GroupKeyManager {
        const identity = EthereumKeyPairIdentity.fromPrivateKey(wallet.privateKey)
        return new GroupKeyManager(
            subscriberKeyExchange,
            groupKeyStore,
            new StreamIDBuilder(identity),
            {
                encryption: {
                    maxKeyRequestsPerSecond: 10,
                    keyRequestTimeout: 100
                } as any
            },
            identity,
            eventEmitter,
            new DestroySignal()
        )
    }

    beforeAll(async () => {
        wallet = await createTestWallet()
    })

    beforeEach(() => {
        groupKeyStore = mock<LocalGroupKeyStore>()
        subscriberKeyExchange = mock<SubscriberKeyExchange>()
        eventEmitter = new StreamrClientEventEmitter()
        groupKeyManager = createGroupKeyManager()
    })

    describe('fetchKey', () => {
        it('key present in (local) group key store', async () => {
            groupKeyStore.get.mockResolvedValueOnce(GROUP_KEY)

            const key = await groupKeyManager.fetchKey(toStreamPartID(STREAM_ID, 0), GROUP_KEY.id, getUserId())
            expect(key).toEqual(GROUP_KEY)
            expect(groupKeyStore.get).toHaveBeenCalledWith(GROUP_KEY.id, getUserId())
            expect(groupKeyStore.get).toHaveBeenCalledTimes(1)
            expect(subscriberKeyExchange.requestGroupKey).toHaveBeenCalledTimes(0)
        })

        it('key present in subscriber key exchange', async () => {
            subscriberKeyExchange.requestGroupKey.mockImplementation(async () => {
                groupKeyStore.get.mockResolvedValue(GROUP_KEY)
                setTimeout(() => eventEmitter.emit('encryptionKeyStoredToLocalStore', GROUP_KEY.id), 0)
            })

            const key = await groupKeyManager.fetchKey(toStreamPartID(STREAM_ID, 0), GROUP_KEY.id, getUserId())
            expect(key).toEqual(GROUP_KEY)
            expect(groupKeyStore.get).toHaveBeenCalledTimes(2)
            expect(subscriberKeyExchange.requestGroupKey).toHaveBeenCalledWith(
                GROUP_KEY.id,
                getUserId(),
                toStreamPartID(STREAM_ID, 0)
            )
            expect(subscriberKeyExchange.requestGroupKey).toHaveBeenCalledTimes(1)
        })

        it('key not present anywhere (timeout)', async () => {
            await expect(groupKeyManager.fetchKey(toStreamPartID(STREAM_ID, 0), GROUP_KEY.id, getUserId()))
                .rejects
                .toThrow('waitForEvent (timed out after 100 ms)')
            expect(groupKeyStore.get).toHaveBeenCalledTimes(1)
            expect(subscriberKeyExchange.requestGroupKey).toHaveBeenCalledTimes(1)
        })
    })

    describe('storeKey', () => {
        it('given pre-defined key stores in (local) group key store', async () => {
            const returnedGroupKey = await groupKeyManager.storeKey(GROUP_KEY, getUserId(), STREAM_ID)
            expect(returnedGroupKey).toEqual(GROUP_KEY)
            expect(groupKeyStore.set).toHaveBeenCalledWith(GROUP_KEY.id, getUserId(), GROUP_KEY.data)
        })

        describe('given no pre-defined key', () => {
            it('generates new key and stores only in (local) group key store', async () => {
                const returnedGroupKey = await groupKeyManager.storeKey(undefined, getUserId(), STREAM_ID)
                expect(groupKeyStore.set).toHaveBeenCalledWith(returnedGroupKey.id, getUserId(), returnedGroupKey.data)
            })
        })
    })

    it('addKeyToLocalStore delegates to groupKeyStore#add', async () => {
        await groupKeyManager.addKeyToLocalStore(GROUP_KEY, getUserId())
        expect(groupKeyStore.set).toHaveBeenCalledWith(GROUP_KEY.id, getUserId(), GROUP_KEY.data)
    })

    describe('fetchLatestEncryptionKey', () => {

        it('happy path', async () => {
            const key = GroupKey.generate()
            groupKeyStore.getLatestEncryptionKeyId.calledWith(getUserId(), STREAM_ID).mockResolvedValue(key.id)
            groupKeyStore.get.calledWith(key.id, getUserId()).mockResolvedValue(key)
            expect(await groupKeyManager.fetchLatestEncryptionKey(getUserId(), STREAM_ID)).toEqual(key)
        })

        it('key reference not found', async () => {
            const key = GroupKey.generate()
            groupKeyStore.get.calledWith(key.id, getUserId()).mockResolvedValue(key)
            expect(await groupKeyManager.fetchLatestEncryptionKey(getUserId(), STREAM_ID)).toBeUndefined()
        })

        it('key data not found', async () => {
            const key = GroupKey.generate()
            groupKeyStore.getLatestEncryptionKeyId.calledWith(getUserId(), STREAM_ID).mockResolvedValue(key.id)
            expect(await groupKeyManager.fetchLatestEncryptionKey(getUserId(), STREAM_ID)).toBeUndefined()
        })

        it('not own key', async () => {
            await expect(() => {
                return groupKeyManager.fetchLatestEncryptionKey(randomUserId(), STREAM_ID)
            }).rejects.toThrow('not supported')
        })
    })
})
