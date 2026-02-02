import { createTestWallet } from '@streamr/test-utils'
import { StreamPartIDUtils, utf8ToBinary } from '@streamr/utils'
import { mock } from 'jest-mock-extended'
import { DestroySignal } from '../../src/DestroySignal'
import { StreamrClientError } from '../../src/StreamrClientError'
import { GroupKey } from '../../src/encryption/GroupKey'
import { GroupKeyManager } from '../../src/encryption/GroupKeyManager'
import { decrypt } from '../../src/encryption/decrypt'
import { createGroupKeyManager, createMockEncryptionService, createMockMessage } from '../test-utils/utils'
import { StreamMessage, StreamMessageAESEncrypted } from './../../src/protocol/StreamMessage'
import { EncryptionType } from '@streamr/trackerless-network'
import { EthereumKeyPairIdentity } from '../../src/identity/EthereumKeyPairIdentity'

describe('Decrypt', () => {

    it('happy path', async () => {
        const groupKey = GroupKey.generate()
        const groupKeyManager = mock<GroupKeyManager>()
        groupKeyManager.fetchKey.mockResolvedValueOnce(groupKey)
        const destroySignal = new DestroySignal()
        // using Buffer to get around Jest's strict equality check
        const unencryptedContent = Buffer.from(utf8ToBinary(JSON.stringify({ hello: 'world' })))
        const encryptedMessage = await createMockMessage({
            streamPartId: StreamPartIDUtils.parse('stream#0'),
            publisher: await createTestWallet(),
            encryptionKey: groupKey,
            content: unencryptedContent
        }) as StreamMessageAESEncrypted
        const decryptedMessage = await decrypt(encryptedMessage, groupKeyManager, createMockEncryptionService(), destroySignal)
        expect(decryptedMessage).toEqual(new StreamMessage({
            ...encryptedMessage,
            encryptionType: EncryptionType.NONE,
            content: unencryptedContent
        }))
        expect(groupKeyManager.fetchKey).toHaveBeenCalledWith(
            encryptedMessage.getStreamPartID(),
            encryptedMessage.groupKeyId,
            encryptedMessage.getPublisherId()
        )
    })

    it('group key not available: timeout while waiting', async () => {
        const wallet = await createTestWallet()
        const groupKeyManager = await createGroupKeyManager(EthereumKeyPairIdentity.fromPrivateKey(wallet.privateKey))
        const destroySignal = new DestroySignal()
        const groupKey = GroupKey.generate()
        const msg = await createMockMessage({
            streamPartId: StreamPartIDUtils.parse('stream#0'),
            publisher: wallet,
            encryptionKey: groupKey
        })
        await expect(() => {
            return decrypt(
                msg as StreamMessageAESEncrypted,
                groupKeyManager,
                createMockEncryptionService(),
                destroySignal)
        }).rejects.toThrowStreamrClientError(
            new StreamrClientError(`Could not get encryption key ${groupKey.id}`, 'DECRYPT_ERROR', msg)
        )
    })
})
