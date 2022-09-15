import { EventEmitter } from 'eventemitter3'
import 'reflect-metadata'
import { StreamPartIDUtils } from 'streamr-client-protocol'
import { fastWallet } from 'streamr-test-utils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamrClientEventEmitter } from '../../src/events'
import { Decrypt } from '../../src/subscribe/Decrypt'
import { Signal } from '../../src/utils/Signal'
import { createMockMessage, mockContext } from '../test-utils/utils'

describe('Decrypt', () => {

    it('group key not available: timeout while waiting', async () => {
        const groupKeyStoreFactory = {
            getStore: () => ({
                get: async () => undefined,
                eventEmitter: new EventEmitter()
            })
        }
        const keyExchange = {
            requestGroupKey: async () => {}
        }
        const decrypt = new Decrypt(
            mockContext(),
            groupKeyStoreFactory as any,
            keyExchange as any,
            {
                clearStream: jest.fn()
            } as any,
            {
                onDestroy: Signal.create()
            } as any,
            new StreamrClientEventEmitter(),
            {
                encryptionKeyRequest: 50
            } as any
        )
        const groupKey = GroupKey.generate()
        const msg = createMockMessage({
            streamPartId: StreamPartIDUtils.parse('stream#0'),
            publisher: fastWallet(),
            encryptionKey: groupKey
        })
        await expect(() => decrypt.decrypt(msg)).rejects.toThrow(`Decrypt error: Could not get GroupKey ${groupKey.id}`)
    })
})
