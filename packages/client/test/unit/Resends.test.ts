import 'reflect-metadata'

import { StreamMessage, StreamPartIDUtils } from '@streamr/protocol'
import { fastWallet, randomEthereumAddress } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import { createPrivateKeyAuthentication } from '../../src/Authentication'
import { DestroySignal } from '../../src/DestroySignal'
import { GroupKey } from '../../src/encryption/GroupKey'
import { MessageFactory } from '../../src/publish/MessageFactory'
import { Resends } from '../../src/subscribe/Resends'
import { createGroupKeyQueue, createStreamRegistryCached, mockLoggerFactory } from '../test-utils/utils'

const PUBLISHER_WALLET = fastWallet()
const STREAM_PART_ID = StreamPartIDUtils.parse(`${PUBLISHER_WALLET.address}/path#0`)
const STORAGE_NODE_ADDRESS = randomEthereumAddress()
const STORAGE_NODE_URL = 'mock.test/foobar'
const GROUP_KEY = GroupKey.generate()

describe('Resends', () => {

    let messageFactory: MessageFactory

    beforeEach(async () => {
        const authentication = createPrivateKeyAuthentication(PUBLISHER_WALLET.privateKey, undefined as any)
        messageFactory = new MessageFactory({
            authentication,
            streamId: StreamPartIDUtils.getStreamID(STREAM_PART_ID),
            streamRegistry: createStreamRegistryCached(),
            groupKeyQueue: await createGroupKeyQueue(authentication, GROUP_KEY)
        })
    })

    const createResends = (messages: StreamMessage[]): Resends => {
        return new Resends(
            {
                getStorageNodes: async () => [STORAGE_NODE_ADDRESS]
            } as any,
            {
                getStorageNodeMetadata: async () => ({ http: STORAGE_NODE_URL })
            } as any,
            createStreamRegistryCached(),
            {
                fetchHttpStream: async function*() {
                    yield* messages
                }
            } as any,
            {
                fetchKey: async () => GROUP_KEY
            } as any,
            new DestroySignal(),
            { 
                orderMessages: true,
                gapFill: true,
                maxGapRequests: 5,
                gapFillTimeout: 5000,
                retryResendAfter: 5000
            } as any,
            mockLoggerFactory()
        )
    }

    it('last', async () => {
        const storageNodeMessages = [
            await messageFactory.createMessage({ foo: 1 }, { timestamp: 1000 }),
            await messageFactory.createMessage({ foo: 2 }, { timestamp: 2000 })
        ]
        const resends = createResends(storageNodeMessages)
        const messageStream = await resends.last(STREAM_PART_ID, { count: 2 }, false)
        const receivedMessages = await collect(messageStream)
        expect(receivedMessages.map((msg) => msg.content)).toEqual([
            { foo: 1 },
            { foo: 2 }
        ])
    })
})
