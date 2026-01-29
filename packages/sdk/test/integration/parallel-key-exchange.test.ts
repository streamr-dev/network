import { createTestWallet } from '@streamr/test-utils'
import { collect, wait } from '@streamr/utils'
import { Wallet } from 'ethers'
import { mock } from 'jest-mock-extended'
import range from 'lodash/range'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { StreamMessageType } from '../../src/protocol/StreamMessage'
import { MessageFactory } from '../../src/publish/MessageFactory'
import { SignatureValidator } from '../../src/signature/SignatureValidator'
import { createGroupKeyQueue, createMessageSigner, createStreamRegistry } from '../test-utils/utils'
import { FakeEnvironment } from './../test-utils/fake/FakeEnvironment'
import { EthereumKeyPairIdentity } from '../../src/identity/EthereumKeyPairIdentity'
import { createStrictConfig } from '../../src/Config'

const PUBLISHER_COUNT = 50
const MESSAGE_COUNT_PER_PUBLISHER = 3

interface PublisherInfo {
    wallet: Wallet
    groupKey: GroupKey
    client?: StreamrClient
}

describe('parallel key exchange', () => {

    let environment: FakeEnvironment
    let stream: Stream
    let subscriber: StreamrClient
    let publishers: PublisherInfo[]

    beforeAll(async () => {
        environment = new FakeEnvironment()
        subscriber = environment.createClient()
        stream = await subscriber.createStream('/path')
        publishers = await Promise.all(range(PUBLISHER_COUNT).map(async () => ({
            wallet: await createTestWallet(),
            groupKey: GroupKey.generate()
        })))
        await Promise.all(publishers.map(async (publisher) => {
            await stream.grantPermissions({
                userId: publisher.wallet.address,
                permissions: [StreamPermission.PUBLISH]
            })
            publisher.client = environment.createClient({
                auth: {
                    privateKey: publisher.wallet.privateKey
                }
            })
            await publisher.client.addEncryptionKey(publisher.groupKey, publisher.wallet.address)
        }))
    }, 20000)

    afterAll(async () => {
        await environment.destroy()
    })

    it('happy path', async () => {
        const sub = await subscriber.subscribe(stream.id)

        for (const publisher of publishers) {
            const identity = EthereumKeyPairIdentity.fromPrivateKey(publisher.wallet.privateKey)
            const messageFactory = new MessageFactory({
                streamId: stream.id,
                identity: identity,
                streamRegistry: createStreamRegistry({
                    partitionCount: 1,
                    isPublicStream: false,
                    isStreamPublisher: true
                }),
                groupKeyQueue: await createGroupKeyQueue(identity, publisher.groupKey),
                signatureValidator: mock<SignatureValidator>(),
                messageSigner: createMessageSigner(identity),
                config: createStrictConfig()
            })
            for (let i = 0; i < MESSAGE_COUNT_PER_PUBLISHER; i++) {
                const msg = await messageFactory.createMessage({
                    foo: 'bar'
                }, {
                    timestamp: Date.now()
                })
                const node = publisher.client!.getNode()
                await node.broadcast(msg)
                await wait(10)
            }
        }

        const expectedMessageCount = PUBLISHER_COUNT * MESSAGE_COUNT_PER_PUBLISHER
        const messages = await collect(sub, expectedMessageCount)
        expect(messages).toHaveLength(expectedMessageCount)
        expect(messages.filter((msg) => !((msg.content as any).foo === 'bar'))).toEqual([])
        expect(environment.getNetwork().getSentMessages({
            messageType: StreamMessageType.GROUP_KEY_REQUEST
        })).toHaveLength(PUBLISHER_COUNT)
    }, 30 * 1000)
})
