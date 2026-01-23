import { createTestWallet, randomEthereumAddress } from '@streamr/test-utils'
import { EthereumAddress, toUserId, UserID, wait } from '@streamr/utils'
import { Wallet } from 'ethers'
import { StreamrClient } from '../../src/StreamrClient'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createRelativeTestStreamId, startPublisherKeyExchangeSubscription } from '../test-utils/utils'
import { StreamMessage, StreamMessageType } from './../../src/protocol/StreamMessage'
import { ContentType, EncryptionType, GroupKeyResponse, SignatureType } from '@streamr/trackerless-network'
import { Stream } from '../../src/Stream'
import type { StreamrClientConfig } from '../../src/ConfigTypes'

describe('PublisherKeyExchange', () => {

    let publisherWallet: Wallet
    let subscriberWallet: Wallet
    let environment: FakeEnvironment
    let key: GroupKey

    const createClientAndStream = async (config: StreamrClientConfig = {}): Promise<{ publisherClient: StreamrClient, stream: Stream }> => {
        const publisherClient = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            },
            ...config,
        })
        const stream = await publisherClient.createStream(createRelativeTestStreamId(module))
        await publisherClient.grantPermissions(stream.id, {
            permissions: [StreamPermission.SUBSCRIBE],
            userId: subscriberWallet.address
        })
        const streamPartId = (await stream.getStreamParts())[0]
        await startPublisherKeyExchangeSubscription(publisherClient, streamPartId)

        await publisherClient.updateEncryptionKey({
            key,
            distributionMethod: 'rekey',
            streamId: stream.id,
        })

        return {
            publisherClient,
            stream,
        }
    }

    const triggerGroupKeyRequest = async (publisherClient: StreamrClient, stream: Stream, 
        subscriberClientOptions: StreamrClientConfig = {}, erc1271Contract?: EthereumAddress): Promise<void> => {
        const subscriberClient = environment.createClient({
            auth: {
                privateKey: subscriberWallet.privateKey
            },
            ...subscriberClientOptions,
        })
        await subscriberClient.subscribe(stream.id)
        await publisherClient.publish(stream.id, {}, { erc1271Contract })
    }

    const assertValidResponse = async (
        actualResponse: StreamMessage,
        expectedStreamId: string,
        expectedGroupKey: GroupKey,
        expectedPublisherId: UserID,
        expectedSignatureType: SignatureType
    ): Promise<void> => {
        expect(actualResponse).toMatchObject({
            messageId: {
                streamId: expectedStreamId,
                streamPartition: 0,
                publisherId: expectedPublisherId,
            },
            messageType: StreamMessageType.GROUP_KEY_RESPONSE,
            contentType: ContentType.BINARY,
            encryptionType: EncryptionType.NONE,
            signature: expect.any(Uint8Array),
            signatureType: expectedSignatureType
        })
        const groupKeyResponse = GroupKeyResponse.fromBinary(actualResponse.content)
        const encryptedGroupKeys = groupKeyResponse.groupKeys
        expect(encryptedGroupKeys).toMatchObject([{
            id: expectedGroupKey.id,
            data: expect.any(Uint8Array)
        }])
    }

    beforeEach(async () => {
        publisherWallet = await createTestWallet()
        subscriberWallet = await createTestWallet()
        environment = new FakeEnvironment()
        key = GroupKey.generate()
    })

    afterEach(async () => {
        await environment.destroy()
    })

    /*
        * A publisher node starts a subscription to receive group key requests
        * - tests that a correct kind of response message is sent to a subscriber node
        */
    it('responds to a group key request using default settings', async () => {
        const { publisherClient, stream } = await createClientAndStream()

        await triggerGroupKeyRequest(publisherClient, stream)

        const response = await environment.getNetwork().waitForSentMessage({
            messageType: StreamMessageType.GROUP_KEY_RESPONSE
        })
        await assertValidResponse(response, stream.id, key, toUserId(publisherWallet.address), SignatureType.ECDSA_SECP256K1_EVM)
    })

    it('responds to a group key request using ERC-1271 identity', async () => {
        const { publisherClient, stream } = await createClientAndStream()
        const erc1271ContractAddress = randomEthereumAddress()
        
        await publisherClient.grantPermissions(stream.id, {
            permissions: [StreamPermission.PUBLISH],
            userId: erc1271ContractAddress
        })
        environment.getChain().addErc1271AllowedAddress(erc1271ContractAddress, toUserId(publisherWallet.address))

        await triggerGroupKeyRequest(publisherClient, stream, {}, erc1271ContractAddress)

        const response = await environment.getNetwork().waitForSentMessage({
            messageType: StreamMessageType.GROUP_KEY_RESPONSE
        })
        await assertValidResponse(response, stream.id, key, toUserId(erc1271ContractAddress), SignatureType.ERC_1271)
    })

    describe('quantum resistant key exchange', () => {
        it('works when both publisher and subscriber require quantum security', async () => {
            const { publisherClient, stream } = await createClientAndStream({
                encryption: {
                    requireQuantumResistantKeyExchange: true,
                }
            })
    
            await triggerGroupKeyRequest(publisherClient, stream, {
                encryption: {
                    requireQuantumResistantKeyExchange: true,
                }
            })
    
            const response = await environment.getNetwork().waitForSentMessage({
                messageType: StreamMessageType.GROUP_KEY_RESPONSE
            })
            await assertValidResponse(response, stream.id, key, toUserId(publisherWallet.address), SignatureType.ECDSA_SECP256K1_EVM)
        })

        it('works when subscriber requests quantum security', async () => {
            const { publisherClient, stream } = await createClientAndStream()
    
            await triggerGroupKeyRequest(publisherClient, stream, {
                encryption: {
                    requireQuantumResistantKeyExchange: true,
                }
            })
    
            const response = await environment.getNetwork().waitForSentMessage({
                messageType: StreamMessageType.GROUP_KEY_RESPONSE
            })
            await assertValidResponse(response, stream.id, key, toUserId(publisherWallet.address), SignatureType.ECDSA_SECP256K1_EVM)
        })

        it('fails when publisher requires it but subscriber does not', async () => {
            const { publisherClient, stream } = await createClientAndStream({
                encryption: {
                    requireQuantumResistantKeyExchange: true,
                }
            })
    
            // The invalid request just prints a debug level error on the publisher.
            // Since the error is swallowed, it's difficult to assert the error here.
            await triggerGroupKeyRequest(publisherClient, stream)
    
            // Due to the above, rely on time - not foolproof
            await wait(3000)

            // Check that no response was sent
            const sentMessages = environment.getNetwork().getSentMessages({
                messageType: StreamMessageType.GROUP_KEY_RESPONSE
            })
            expect(sentMessages).toStrictEqual([])
        })
    })
})
