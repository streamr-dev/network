import 'reflect-metadata'
import { FakeEnvironment } from './../test-utils/fake/FakeEnvironment'
import { range } from 'lodash'
import { fastWallet } from 'streamr-test-utils'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { GroupKey } from '../../src/encryption/GroupKey'
import { Wallet } from '@ethersproject/wallet'
import { StreamMessage } from 'streamr-client-protocol'
import { wait } from '@streamr/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { MessageFactory } from '../../src/publish/MessageFactory'
import { createAuthentication } from '../../src/Authentication'

const PUBLISHER_COUNT = 50
const MESSAGE_COUNT_PER_PUBLISHER = 3

interface PublisherInfo {
    wallet: Wallet
    groupKey: GroupKey
    client?: StreamrClient
}

const PUBLISHERS: PublisherInfo[] = range(PUBLISHER_COUNT).map(() => ({
    wallet: fastWallet(),
    groupKey: GroupKey.generate()
}))

describe('parallel key exchange', () => {

    let environment: FakeEnvironment
    let stream: Stream
    let subscriber: StreamrClient

    beforeAll(async () => {
        environment = new FakeEnvironment()
        subscriber = environment.createClient()
        stream = await subscriber.createStream('/path')
        await Promise.all(PUBLISHERS.map(async (publisher) => {
            await stream.grantPermissions({
                user: publisher.wallet.address,
                permissions: [StreamPermission.PUBLISH]
            })
            publisher.client = environment.createClient({
                auth: {
                    privateKey: publisher.wallet.privateKey
                }
            })
            await publisher.client.addEncryptionKey(publisher.groupKey, stream.id)
        }))
    }, 20000)

    it('happy path', async () => {
        const sub = await subscriber.subscribe(stream.id)

        for (const publisher of PUBLISHERS) {
            const authentication = createAuthentication({
                privateKey: publisher.wallet.privateKey
            }, undefined as any)
            const messageFactory = new MessageFactory({
                publisherId: publisher.wallet.address,
                streamId: stream.id,
                getPartitionCount: async () => 1,
                isPublicStream: async () => false,
                isPublisher: async () => true,
                createSignature: async (payload: string) => authentication.createMessagePayloadSignature(payload),
                useGroupKey: async () => ({ current: publisher.groupKey })
            })
            for (let i = 0; i < MESSAGE_COUNT_PER_PUBLISHER; i++) {
                const msg = await messageFactory.createMessage({
                    foo: 'bar'
                }, {
                    timestamp: Date.now()
                })
                const node = await publisher.client!.getNode()
                node.publish(msg)
                await wait(10)
            }
        }

        const expectedMessageCount = PUBLISHER_COUNT * MESSAGE_COUNT_PER_PUBLISHER
        const messages = await sub.collect(expectedMessageCount)
        expect(messages).toHaveLength(expectedMessageCount)
        expect(messages.filter((msg) => !((msg.getParsedContent() as any).foo === 'bar'))).toEqual([])
        expect(environment.getNetwork().getSentMessages({
            messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST
        })).toHaveLength(PUBLISHER_COUNT)
    }, 30 * 1000)
})
