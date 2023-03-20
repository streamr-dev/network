import 'reflect-metadata'

import { StreamPartIDUtils } from '@streamr/protocol'
import { fastWallet } from '@streamr/test-utils'
import { DestroySignal } from '../../src/DestroySignal'
import { GroupKey } from '../../src/encryption/GroupKey'
import { Decrypt } from '../../src/subscribe/Decrypt'
import { createGroupKeyManager, createMockMessage, mockLoggerFactory } from '../test-utils/utils'
import { createPrivateKeyAuthentication } from '../../src/Authentication'

describe('Decrypt', () => {

    it('group key not available: timeout while waiting', async () => {
        const wallet = fastWallet()
        const decrypt = new Decrypt(
            createGroupKeyManager(undefined, createPrivateKeyAuthentication(wallet.privateKey, {} as any)),
            {
                clearStream: jest.fn()
            } as any,
            new DestroySignal(),
            mockLoggerFactory(),
        )
        const groupKey = GroupKey.generate()
        const msg = await createMockMessage({
            streamPartId: StreamPartIDUtils.parse('stream#0'),
            publisher: wallet,
            encryptionKey: groupKey
        })
        await expect(() => decrypt.decrypt(msg)).rejects.toThrow(`Decrypt error: Could not get GroupKey ${groupKey.id}`)
    })
})
