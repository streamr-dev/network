import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { createMockMessage, createTestStream } from '../test-utils/utils'
import { fastWallet } from 'streamr-test-utils'
import { wait } from '@streamr/utils'
import { StreamID, toStreamPartID } from 'streamr-client-protocol'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'

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
        const networkNode = environment.startNode(publisherWallet.address)
        networkNode.publish(msg)
        await wait(PROPAGATION_WAIT_TIME)
        expect(true).toEqual(true) // we never get here if subscriberClient crashes
    })
})
