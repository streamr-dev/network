import 'reflect-metadata'

import { StreamPartIDUtils } from '@streamr/protocol'
import { fastWallet } from '@streamr/test-utils'
import { DestroySignal } from '../../src/DestroySignal'
import { GroupKey } from '../../src/encryption/GroupKey'
import { Decrypt } from '../../src/subscribe/Decrypt'
import { createGroupKeyManager, createMockMessage, mockLoggerFactory } from '../test-utils/utils'

describe('Decrypt', () => {

    it('group key not available: timeout while waiting', async () => {
        const decrypt = new Decrypt(
            createGroupKeyManager(),
            {
                clearStream: jest.fn()
            } as any,
            new DestroySignal(),
            mockLoggerFactory(),
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
