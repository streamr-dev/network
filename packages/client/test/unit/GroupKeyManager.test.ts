import 'reflect-metadata'
import { GroupKeyManager } from '../../src/encryption/GroupKeyManager'
import { GroupKeyStore } from '../../src/encryption/GroupKeyStore'
import { mock, MockProxy } from 'jest-mock-extended'
import { LitProtocolFacade } from '../../src/encryption/LitProtocolFacade'
import { SubscriberKeyExchange } from '../../src/encryption/SubscriberKeyExchange'
import { StreamrClientEventEmitter } from '../../src/events'
import { DestroySignal } from '../../src/DestroySignal'
import { GroupKey } from '../../src/encryption/GroupKey'
import { toStreamID, toStreamPartID } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'

describe('GroupKeyManager', () => {
    let groupKeyStore: MockProxy<GroupKeyStore>
    let litProtocolFacade: MockProxy<LitProtocolFacade>
    let subscriberKeyExchange: MockProxy<SubscriberKeyExchange>
    let eventEmitter: StreamrClientEventEmitter
    let groupKeyManager: GroupKeyManager

    const groupKeyId = 'groupKeyId-123'
    const streamId = toStreamID('test.eth/foobar')
    const publisherId = randomEthereumAddress()
    const groupKey = GroupKey.generate(groupKeyId)

    function createGroupKeyManager(litProtocolEnabled: boolean): GroupKeyManager {
        return new GroupKeyManager(
            groupKeyStore,
            litProtocolFacade,
            subscriberKeyExchange,
            eventEmitter,
            new DestroySignal(),
            {
                encryption: {
                    litProtocolEnabled,
                    litProtocolLogging: false,
                    maxKeyRequestsPerSecond: 10,
                    keyRequestTimeout: 100
                }
            }
        )
    }

    beforeEach(() => {
        groupKeyStore = mock<GroupKeyStore>()
        litProtocolFacade = mock<LitProtocolFacade>()
        subscriberKeyExchange = mock<SubscriberKeyExchange>()
        eventEmitter = new StreamrClientEventEmitter()
        groupKeyManager = createGroupKeyManager(true)
    })

    describe('fetchKey', () => {
        it('key present in (local) group key store', async () => {
            groupKeyStore.get.mockResolvedValueOnce(groupKey)

            const key = await groupKeyManager.fetchKey(toStreamPartID(streamId, 0), groupKeyId, publisherId)
            expect(key).toEqual(groupKey)
            expect(groupKeyStore.get).toHaveBeenCalledWith(groupKeyId, streamId)
            expect(groupKeyStore.get).toHaveBeenCalledTimes(1)
            expect(litProtocolFacade.get).toHaveBeenCalledTimes(0)
            expect(subscriberKeyExchange.requestGroupKey).toHaveBeenCalledTimes(0)
        })

        it('key present in lit protocol', async () => {
            litProtocolFacade.get.mockResolvedValueOnce(groupKey)

            const key = await groupKeyManager.fetchKey(toStreamPartID(streamId, 0), groupKeyId, publisherId)
            expect(key).toEqual(groupKey)
            expect(groupKeyStore.get).toHaveBeenCalledTimes(1)
            expect(litProtocolFacade.get).toHaveBeenCalledWith(streamId, groupKeyId)
            expect(litProtocolFacade.get).toHaveBeenCalledTimes(1)
            expect(subscriberKeyExchange.requestGroupKey).toHaveBeenCalledTimes(0)
        })

        it('key present in subscriber key exchange', async () => {
            subscriberKeyExchange.requestGroupKey.mockImplementation(async () => {
                setTimeout(() => eventEmitter.emit('addGroupKey', groupKey), 0)
            })

            const key = await groupKeyManager.fetchKey(toStreamPartID(streamId, 0), groupKeyId, publisherId)
            expect(key).toEqual(groupKey)
            expect(groupKeyStore.get).toHaveBeenCalledTimes(1)
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
            expect(groupKeyStore.get).toHaveBeenCalledTimes(1)
            expect(litProtocolFacade.get).toHaveBeenCalledTimes(1)
            expect(subscriberKeyExchange.requestGroupKey).toHaveBeenCalledTimes(1)
        })

        it('skips lit protocol if lit protocol disabled in config', async () => {
            groupKeyManager = createGroupKeyManager(false)
            await expect(groupKeyManager.fetchKey(toStreamPartID(streamId, 0), groupKeyId, publisherId))
                .rejects
                .toThrow('waitForEvent (timed out after 100 ms)')
            expect(groupKeyStore.get).toHaveBeenCalledTimes(1)
            expect(litProtocolFacade.get).toHaveBeenCalledTimes(0)
            expect(subscriberKeyExchange.requestGroupKey).toHaveBeenCalledTimes(1)
        })
    })

    describe('storeKey', () => {
        it('given pre-defined key only stores in (local) group key store and skips lit protocol', async () => {
            const returnedGroupKey = await groupKeyManager.storeKey(groupKey, streamId)
            expect(returnedGroupKey).toEqual(groupKey)
            expect(groupKeyStore.add).toHaveBeenCalledWith(groupKey, streamId)
            expect(litProtocolFacade.store).toHaveBeenCalledTimes(0)
        })

        describe('given no pre-defined key', () => {
            it('lit-protocol online: fetches key from lit protocol and then stores in (local) group key as well', async () => {
                litProtocolFacade.store.mockImplementationOnce(async (_streamId, symmetricKey) => {
                    return new GroupKey('foobarId', Buffer.from(symmetricKey))
                })

                const returnedGroupKey = await groupKeyManager.storeKey(undefined, streamId)
                expect(returnedGroupKey.id).toEqual('foobarId')
                expect(groupKeyStore.add).toHaveBeenCalledWith(returnedGroupKey, streamId)
                expect(litProtocolFacade.store).toHaveBeenCalledWith(streamId, returnedGroupKey.data)

            })

            it('lit-protocol offline: generates new key and stores only in (local) group key store', async () => {
                const returnedGroupKey = await groupKeyManager.storeKey(undefined, streamId)
                expect(groupKeyStore.add).toHaveBeenCalledWith(returnedGroupKey, streamId)
                expect(litProtocolFacade.store).toHaveBeenCalledWith(streamId, returnedGroupKey.data)
            })

            it('lit-protocol disabled: does not even attempt to store key in lit protocol', async () => {
                groupKeyManager = createGroupKeyManager(false)
                await groupKeyManager.storeKey(undefined, streamId)
                expect(litProtocolFacade.store).toHaveBeenCalledTimes(0)
            })
        })
    })

    it('addKeyToLocalStore delegates to groupKeyStore#add', async () => {
        await groupKeyManager.addKeyToLocalStore(groupKey, streamId)
        expect(groupKeyStore.add).toHaveBeenCalledWith(groupKey, streamId)
    })
})
