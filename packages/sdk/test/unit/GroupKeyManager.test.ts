import 'reflect-metadata'

import { fastPrivateKey, randomEthereumAddress } from '@streamr/test-utils'
import { toEthereumAddress, toStreamID, toStreamPartID } from '@streamr/utils'
import { Wallet } from 'ethers'
import { mock, MockProxy } from 'jest-mock-extended'
import { createPrivateKeyAuthentication } from '../../src/Authentication'
import { DestroySignal } from '../../src/DestroySignal'
import { GroupKey } from '../../src/encryption/GroupKey'
import { GroupKeyManager } from '../../src/encryption/GroupKeyManager'
import { LitProtocolFacade } from '../../src/encryption/LitProtocolFacade'
import { LocalGroupKeyStore } from '../../src/encryption/LocalGroupKeyStore'
import { SubscriberKeyExchange } from '../../src/encryption/SubscriberKeyExchange'
import { StreamrClientEventEmitter } from '../../src/events'

describe('GroupKeyManager', () => {
    let localGroupKeyStore: MockProxy<LocalGroupKeyStore>
    let litProtocolFacade: MockProxy<LitProtocolFacade>
    let subscriberKeyExchange: MockProxy<SubscriberKeyExchange>
    let eventEmitter: StreamrClientEventEmitter
    let groupKeyManager: GroupKeyManager

    const groupKeyId = 'groupKeyId-123'
    const streamId = toStreamID('test.eth/foobar')
    const wallet = new Wallet(fastPrivateKey())
    const publisherId = toEthereumAddress(wallet.address)
    const groupKey = GroupKey.generate(groupKeyId)

    function createGroupKeyManager(litProtocolEnabled: boolean): GroupKeyManager {
        return new GroupKeyManager(
            subscriberKeyExchange,
            litProtocolFacade,
            localGroupKeyStore,
            {
                encryption: {
                    litProtocolEnabled,
                    litProtocolLogging: false,
                    maxKeyRequestsPerSecond: 10,
                    keyRequestTimeout: 100
                } as any
            },
            createPrivateKeyAuthentication(wallet.privateKey),
            eventEmitter,
            new DestroySignal()
        )
    }

    beforeEach(() => {
        localGroupKeyStore = mock<LocalGroupKeyStore>()
        litProtocolFacade = mock<LitProtocolFacade>()
        subscriberKeyExchange = mock<SubscriberKeyExchange>()
        eventEmitter = new StreamrClientEventEmitter()
        groupKeyManager = createGroupKeyManager(true)
    })

    describe('fetchKey', () => {
        it('key present in (local) group key store', async () => {
            localGroupKeyStore.get.mockResolvedValueOnce(groupKey)

            const key = await groupKeyManager.fetchKey(toStreamPartID(streamId, 0), groupKeyId, publisherId)
            expect(key).toEqual(groupKey)
            expect(localGroupKeyStore.get).toHaveBeenCalledWith(groupKeyId, publisherId)
            expect(localGroupKeyStore.get).toHaveBeenCalledTimes(1)
            expect(litProtocolFacade.get).toHaveBeenCalledTimes(0)
            expect(subscriberKeyExchange.requestGroupKey).toHaveBeenCalledTimes(0)
        })

        it('key present in lit protocol', async () => {
            litProtocolFacade.get.mockResolvedValueOnce(groupKey)

            const key = await groupKeyManager.fetchKey(toStreamPartID(streamId, 0), groupKeyId, publisherId)
            expect(key).toEqual(groupKey)
            expect(localGroupKeyStore.get).toHaveBeenCalledTimes(1)
            expect(litProtocolFacade.get).toHaveBeenCalledWith(streamId, groupKeyId)
            expect(litProtocolFacade.get).toHaveBeenCalledTimes(1)
            expect(subscriberKeyExchange.requestGroupKey).toHaveBeenCalledTimes(0)
        })

        it('key present in subscriber key exchange', async () => {
            subscriberKeyExchange.requestGroupKey.mockImplementation(async () => {
                localGroupKeyStore.get.mockResolvedValue(groupKey)
                setTimeout(() => eventEmitter.emit('encryptionKeyStoredToLocalStore', groupKey.id), 0)
            })

            const key = await groupKeyManager.fetchKey(toStreamPartID(streamId, 0), groupKeyId, publisherId)
            expect(key).toEqual(groupKey)
            expect(localGroupKeyStore.get).toHaveBeenCalledTimes(2)
            expect(litProtocolFacade.get).toHaveBeenCalledTimes(1)
            expect(subscriberKeyExchange.requestGroupKey).toHaveBeenCalledWith(
                groupKeyId,
                publisherId,
                toStreamPartID(streamId, 0)
            )
            expect(subscriberKeyExchange.requestGroupKey).toHaveBeenCalledTimes(1)
        })

        it('key not present anywhere (timeout)', async () => {
            await expect(groupKeyManager.fetchKey(toStreamPartID(streamId, 0), groupKeyId, publisherId))
                .rejects
                .toThrow('waitForEvent (timed out after 100 ms)')
            expect(localGroupKeyStore.get).toHaveBeenCalledTimes(1)
            expect(litProtocolFacade.get).toHaveBeenCalledTimes(1)
            expect(subscriberKeyExchange.requestGroupKey).toHaveBeenCalledTimes(1)
        })
    })

    describe('storeKey', () => {
        it('given pre-defined key only stores in (local) group key store and skips lit protocol', async () => {
            const returnedGroupKey = await groupKeyManager.storeKey(groupKey, publisherId, streamId)
            expect(returnedGroupKey).toEqual(groupKey)
            expect(localGroupKeyStore.set).toHaveBeenCalledWith(groupKey.id, publisherId, groupKey.data)
            expect(litProtocolFacade.store).toHaveBeenCalledTimes(0)
        })

        describe('given no pre-defined key', () => {
            it('lit-protocol online: fetches key from lit protocol and then stores in (local) group key as well', async () => {
                litProtocolFacade.store.mockImplementationOnce(async (_streamId, symmetricKey) => {
                    return new GroupKey('foobarId', Buffer.from(symmetricKey))
                })

                const returnedGroupKey = await groupKeyManager.storeKey(undefined, publisherId, streamId)
                expect(returnedGroupKey.id).toEqual('foobarId')
                expect(localGroupKeyStore.set).toHaveBeenCalledWith(returnedGroupKey.id, publisherId, returnedGroupKey.data)
                expect(litProtocolFacade.store).toHaveBeenCalledWith(streamId, returnedGroupKey.data)

            })

            it('lit-protocol offline: generates new key and stores only in (local) group key store', async () => {
                const returnedGroupKey = await groupKeyManager.storeKey(undefined, publisherId, streamId)
                expect(localGroupKeyStore.set).toHaveBeenCalledWith(returnedGroupKey.id, publisherId, returnedGroupKey.data)
                expect(litProtocolFacade.store).toHaveBeenCalledWith(streamId, returnedGroupKey.data)
            })
        })
    })

    it('addKeyToLocalStore delegates to localGroupKeyStore#add', async () => {
        await groupKeyManager.addKeyToLocalStore(groupKey, publisherId)
        expect(localGroupKeyStore.set).toHaveBeenCalledWith(groupKey.id, publisherId, groupKey.data)
    })

    describe('fetchLatestEncryptionKey', () => {

        it('happy path', async () => {
            const key = GroupKey.generate()
            localGroupKeyStore.getLatestEncryptionKeyId.calledWith(publisherId, streamId).mockResolvedValue(key.id)
            localGroupKeyStore.get.calledWith(key.id, publisherId).mockResolvedValue(key)
            expect(await groupKeyManager.fetchLatestEncryptionKey(publisherId, streamId)).toEqual(key)
        })

        it('key reference not found', async () => {
            const key = GroupKey.generate()
            localGroupKeyStore.get.calledWith(key.id, publisherId).mockResolvedValue(key)
            expect(await groupKeyManager.fetchLatestEncryptionKey(publisherId, streamId)).toBeUndefined()
        })

        it('key data not found', async () => {
            const key = GroupKey.generate()
            localGroupKeyStore.getLatestEncryptionKeyId.calledWith(publisherId, streamId).mockResolvedValue(key.id)
            expect(await groupKeyManager.fetchLatestEncryptionKey(publisherId, streamId)).toBeUndefined()
        })

        it('not own key', async () => {
            await expect(() => {
                return groupKeyManager.fetchLatestEncryptionKey(randomEthereumAddress(), streamId)
            }).rejects.toThrow('not supported')
        })
    })
})
