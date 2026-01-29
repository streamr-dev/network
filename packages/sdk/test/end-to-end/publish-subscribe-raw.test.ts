import { StreamID, toUserId } from '@streamr/utils'
import { createMessageSigner, createTestClient, createTestStream } from '../test-utils/utils'
import { nextValue } from '../../src/utils/iterators'
import { EthereumKeyPairIdentity } from '../../src/identity/EthereumKeyPairIdentity'
import { Wallet } from 'ethers'
import { MessageID } from '../../src/protocol/MessageID'
import { ContentType, EncryptionType, SignatureType } from '@streamr/trackerless-network'
import { StreamMessageType } from '../../src/protocol/StreamMessage'
import { StreamPermission } from '../../src/permission'
import { createTestWallet } from '@streamr/test-utils'

describe('publish-subscribe-raw', () => {

    let streamId: StreamID
    let publisherWallet: Wallet

    beforeEach(async () => {
        const creatorWallet = await createTestWallet({ gas: true })
        const creatorClient = createTestClient(creatorWallet.privateKey)
        const stream = await createTestStream(creatorClient, module)
        streamId = stream.id
        publisherWallet = await createTestWallet()
        stream.grantPermissions({
            userId: publisherWallet.address.toLowerCase(),
            permissions: [StreamPermission.PUBLISH]
        })
        await creatorClient.destroy()
    })

    async function createTestMessage() {
        const messageSigner = createMessageSigner(EthereumKeyPairIdentity.fromPrivateKey(publisherWallet.privateKey))
        return await messageSigner.createSignedMessage({
            messageId: new MessageID(streamId, 0, 123456789, 0, toUserId(publisherWallet.address), 'mock-msgChainId'),
            content: new Uint8Array([1, 2, 3]),
            contentType: ContentType.BINARY,
            encryptionType: EncryptionType.NONE,
            messageType: StreamMessageType.MESSAGE
        }, SignatureType.ECDSA_SECP256K1_EVM)
    }

    it('happy path', async () => {
        const publisher = createTestClient()
        const subscriber = createTestClient()
        const subcription = await subscriber.subscribe({ streamId, raw: true })
        const sentMessage = await createTestMessage()
        await publisher.publishRaw(sentMessage)
        const receivedMessage = await nextValue(subcription[Symbol.asyncIterator]())
        expect(receivedMessage! .streamMessage).toEqual(sentMessage)
        await publisher.destroy()
        await subscriber.destroy()
    })
})
