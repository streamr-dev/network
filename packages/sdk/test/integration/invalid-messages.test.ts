import 'reflect-metadata'

import { fastWallet } from '@streamr/test-utils'
import { StreamID, toStreamPartID, wait } from '@streamr/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createMockMessage, createTestStream } from '../test-utils/utils'

const PROPAGATION_WAIT_TIME = 2000

describe('client behaviour on invalid message', () => {
    let streamId: StreamID
    let subscriberClient: StreamrClient
    let environment: FakeEnvironment

    beforeAll(async () => {
        environment = new FakeEnvironment()
        const creatorClient = environment.createClient()
        try {
            const stream = await createTestStream(creatorClient, module)
            streamId = stream.id
            await stream.grantPermissions({
                permissions: [StreamPermission.SUBSCRIBE],
                public: true
            })
        } finally {
            await creatorClient.destroy()
        }
    })

    afterAll(async () => {
        await environment.destroy()
    })

    beforeEach(async () => {
        subscriberClient = environment.createClient()
    })

    afterEach(async () => {
        await environment.destroy()
    })

    it('invalid messages received by subscriber do not cause unhandled promise rejection (NET-774)', async () => {
        // the stream doesn't have publish permission for publisherWallet.address
        // - network node can publish it, but the subscribe sees that it is an invalid message
        await subscriberClient.subscribe(streamId, () => {
            throw new Error('should not get here')
        })
        const publisherWallet = fastWallet()
        const msg = await createMockMessage({
            streamPartId: toStreamPartID(streamId, 0),
            publisher: publisherWallet
        })
        const networkNode = environment.createNode()
        await networkNode.broadcast(msg)
        await wait(PROPAGATION_WAIT_TIME)
        expect(true).toEqual(true) // we never get here if subscriberClient crashes
    })
})
