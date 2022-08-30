import 'reflect-metadata'
import { FakeEnvironment } from './../test-utils/fake/FakeEnvironment'
import { range } from 'lodash'
import { fastWallet } from 'streamr-test-utils'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { GroupKey } from '../../src/encryption/GroupKey'
import { Wallet } from '@ethersproject/wallet'
import { createMockMessage, startPublisherKeyExchangeSubscription } from '../test-utils/utils'
import { MessageRef, StreamMessage } from 'streamr-client-protocol'
import { wait } from '@streamr/utils'
import { StreamrClient } from '../../src/StreamrClient'

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

    let stream: Stream
    let subscriber: StreamrClient

    beforeAll(async () => {
        const environment = new FakeEnvironment()
        subscriber = environment.createClient()
        stream = await subscriber.createStream('/path')
        await Promise.all(PUBLISHERS.map(async (publisher) => {
            await stream.grantPermissions({
                user: publisher.wallet.address,
                permissions: [StreamPermission.PUBLISH]
            })
            const groupKey = publisher.groupKey
            publisher.client = environment.createClient({
                auth: {
                    privateKey: publisher.wallet.privateKey
                },
                encryptionKeys: {
                    [stream.id]: {
                        [groupKey.id]: groupKey
                    }
                }
            })
            await startPublisherKeyExchangeSubscription(publisher.client)
        }))
    }, 20000)

    it('happy path', async () => {
        const sub = await subscriber.subscribe(stream.id)

        for (const publisher of PUBLISHERS) {
            let prevMessage: StreamMessage | undefined
            for (let i = 0; i < MESSAGE_COUNT_PER_PUBLISHER; i++) {
                const msg = createMockMessage({
                    content: {
                        foo: 'bar'
                    },
                    stream,
                    publisher: publisher.wallet,
                    encryptionKey: publisher.groupKey,
                    prevMsgRef: (prevMessage !== undefined) ? new MessageRef(prevMessage.getTimestamp(), prevMessage.getSequenceNumber()) : null
                })
                const node = await publisher.client!.getNode()
                node.publish(msg)
                await wait(10)
                prevMessage = msg
            }
        }

        const expectedMessageCount = PUBLISHER_COUNT * MESSAGE_COUNT_PER_PUBLISHER
        const messages = await sub.collect(expectedMessageCount)
        expect(messages).toHaveLength(expectedMessageCount)
        expect(messages.filter((msg) => !((msg.getParsedContent() as any).foo === 'bar'))).toEqual([])
    }, 30 * 1000)
})
