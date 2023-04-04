import 'reflect-metadata'

import { StreamPartIDUtils } from '@streamr/protocol'
import { fastWallet } from '@streamr/test-utils'
import { DestroySignal } from '../../src/DestroySignal'
import { GroupKey } from '../../src/encryption/GroupKey'
import { decrypt } from '../../src/encryption/decrypt'
import { createGroupKeyManager, createMockMessage } from '../test-utils/utils'
import { createPrivateKeyAuthentication } from '../../src/Authentication'

describe('Decrypt', () => {

    it('group key not available: timeout while waiting', async () => {
        const wallet = fastWallet()
        const groupKeyManager = createGroupKeyManager(undefined, createPrivateKeyAuthentication(wallet.privateKey, {} as any))
        const destroySignal = new DestroySignal()
        const groupKey = GroupKey.generate()
        const msg = await createMockMessage({
            streamPartId: StreamPartIDUtils.parse('stream#0'),
            publisher: wallet,
            encryptionKey: groupKey
        })
        await expect(() => decrypt(msg, groupKeyManager, destroySignal)).rejects.toThrow(`Decrypt error: Could not get GroupKey ${groupKey.id}`)
    })
})
