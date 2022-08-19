import 'reflect-metadata'
import { FakeEnvironment } from './../test-utils/fake/FakeEnvironment'
import { FakeNetworkNode } from './../test-utils/fake/FakeNetworkNode'
import { range } from 'lodash'
import { fastWallet } from 'streamr-test-utils'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { startPublisherNode } from '../test-utils/fake/fakePublisherNode'
import { GroupKey } from '../../src/encryption/GroupKey'
import { Wallet } from '@ethersproject/wallet'
import { createMockMessage } from '../test-utils/utils'
import { MessageRef, StreamMessage } from 'streamr-client-protocol'
import { wait } from '@streamr/utils'
import { StreamrClient } from '../../src/StreamrClient'

const PUBLISHER_COUNT = 50
const MESSAGE_COUNT_PER_PUBLISHER = 3
const GROUP_KEY_FETCH_DELAY = 1000

interface PublisherInfo {
    wallet: Wallet
    groupKey: GroupKey
    node?: FakeNetworkNode
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
        for (const publisher of PUBLISHERS) {
            await stream.grantPermissions({
                user: publisher.wallet.address,
                permissions: [StreamPermission.PUBLISH]
            })
            const node = await startPublisherNode(publisher.wallet, [publisher.groupKey], environment, async () => {
                await wait(GROUP_KEY_FETCH_DELAY)
                return undefined
            })
            publisher.node = node
        }
    })

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
                publisher.node!.publish(msg)
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
