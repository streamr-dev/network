import 'reflect-metadata'

import { StreamPartIDUtils } from '@streamr/protocol'
import { fastWallet } from '@streamr/test-utils'
import { DestroySignal } from '../../src/DestroySignal'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamrClientEventEmitter } from '../../src/events'
import { Decrypt } from '../../src/subscribe/Decrypt'
import { createMockMessage, mockLoggerFactory } from '../test-utils/utils'

describe('Decrypt', () => {

    it('group key not available: timeout while waiting', async () => {
        const groupKeyStore = {
            get: async () => undefined,
        }
        const keyExchange = {
            requestGroupKey: async () => {}
        }
        const decrypt = new Decrypt(
            groupKeyStore as any,
            keyExchange as any,
            {
                clearStream: jest.fn()
            } as any,
            new DestroySignal(),
            mockLoggerFactory(),
            new StreamrClientEventEmitter(),
            {
                keyRequestTimeout: 50
            } as any
        )
        const groupKey = GroupKey.generate()
        const msg = await createMockMessage({
            streamPartId: StreamPartIDUtils.parse('stream#0'),
            publisher: fastWallet(),
            encryptionKey: groupKey
        })
        await expect(() => decrypt.decrypt(msg)).rejects.toThrow(`Decrypt error: Could not get GroupKey ${groupKey.id}`)
    })
})
