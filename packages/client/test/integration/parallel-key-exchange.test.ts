import 'reflect-metadata'
import { DependencyContainer } from 'tsyringe'
import { createFakeContainer, DEFAULT_CLIENT_OPTIONS } from './../test-utils/fake/fakeEnvironment'
import { Subscriber } from './../../src/subscribe/Subscriber'
import { FakeBrubeckNode } from './../test-utils/fake/FakeBrubeckNode'
import { StreamRegistry } from './../../src/registry/StreamRegistry'
import { range } from 'lodash'
import { fastWallet, wait } from 'streamr-test-utils'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { addFakePublisherNode } from '../test-utils/fake/fakePublisherNode'
import { GroupKey } from '../../src/encryption/GroupKey'
import { Wallet } from '@ethersproject/wallet'
import { createMockMessage } from '../test-utils/utils'

// currently if PUBLISHER_COUNT*GROUP_KEY_FETCH_DELAY > jest test timeout (5000s), the test fails as parallel key exchange has not been implemented yet
const PUBLISHER_COUNT = 100
const GROUP_KEY_FETCH_DELAY = 1000

interface PublisherInfo {
    wallet: Wallet,
    groupKey: GroupKey
    node?: FakeBrubeckNode
}

const PUBLISHERS: PublisherInfo[] = range(PUBLISHER_COUNT).map(() => ({
    wallet: fastWallet(),
    groupKey: GroupKey.generate()
}))

describe('parallel key exchange', () => {

    const subscriberWallet = fastWallet()
    let stream: Stream
    let dependencyContainer: DependencyContainer

    beforeAll(async () => {
        dependencyContainer = createFakeContainer({
            ...DEFAULT_CLIENT_OPTIONS,
            auth: {
                privateKey: subscriberWallet.privateKey
            }
        })
        const streamRegistry = dependencyContainer.resolve(StreamRegistry)
        stream = await streamRegistry.createStream('/path')
        for (const publisher of PUBLISHERS) {
            await stream.grantPermissions({
                user: publisher.wallet.address,
                permissions: [StreamPermission.PUBLISH]
            })
            const node = await addFakePublisherNode(publisher.wallet, [publisher.groupKey], dependencyContainer, async () => {
                await wait(GROUP_KEY_FETCH_DELAY)
                return undefined
            })
            publisher.node = node
        }
    })

    it('happy path', async () => {
        const subscriber = dependencyContainer.resolve(Subscriber)
        const sub = await subscriber.subscribe(stream.id)

        await wait(1000)

        for (const publisher of PUBLISHERS) {
            publisher.node?.publishToNode(createMockMessage({
                stream,
                publisher: publisher.wallet,
                encryptionKey: publisher.groupKey
            }))
        }

        const messages = await sub.collect(PUBLISHER_COUNT)
        expect(messages).toHaveLength(PUBLISHER_COUNT)
    })
})