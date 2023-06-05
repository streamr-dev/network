import 'reflect-metadata'

import { StreamMessage, StreamPartIDUtils } from '@streamr/protocol'
import { fastWallet, randomEthereumAddress } from '@streamr/test-utils'
import { EthereumAddress, collect } from '@streamr/utils'
import without from 'lodash/without'
import { createPrivateKeyAuthentication } from '../../src/Authentication'
import { DestroySignal } from '../../src/DestroySignal'
import { GroupKey } from '../../src/encryption/GroupKey'
import { MessageFactory } from '../../src/publish/MessageFactory'
import { Resends } from '../../src/subscribe/Resends'
import { MessagePipelineOptions, createMessagePipeline } from '../../src/subscribe/messagePipeline'
import { createGroupKeyQueue, createStreamRegistryCached, mockLoggerFactory } from '../test-utils/utils'

const PUBLISHER_WALLET = fastWallet()
const STREAM_PART_ID = StreamPartIDUtils.parse(`${PUBLISHER_WALLET.address}/path#0`)
const GROUP_KEY = GroupKey.generate()
const URL_PREFIX = 'http://'
const ETHEREUM_ADDRESS_LENGTH = 42

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

    const createResends = (messagesPerStorageNode: Record<EthereumAddress, StreamMessage[]>): Resends => {
        const resends: Resends = new Resends(
            {
                createMessagePipeline: (opts: Partial<MessagePipelineOptions>) => createMessagePipeline({
                    ...opts,
                    resends,
                    groupKeyManager: {
                        fetchKey: async () => GROUP_KEY
                    } as any,
                    streamRegistryCached: createStreamRegistryCached(),
                    destroySignal: new DestroySignal(),
                    loggerFactory: mockLoggerFactory(),
                    config: { 
                        orderMessages: true,
                        gapFill: true,
                        maxGapRequests: 1,
                        gapFillTimeout: 100,
                        retryResendAfter: 100
                    }
                } as any)
            } as any,
            undefined as any,
            {
                getStorageNodeMetadata: async (nodeAddress: EthereumAddress) => ({ http: `${URL_PREFIX}${nodeAddress}` })
            } as any,
            {
                fetchHttpStream: async function*(url: string) {
                    const nodeAddress = url.substring(URL_PREFIX.length, URL_PREFIX.length + ETHEREUM_ADDRESS_LENGTH) as EthereumAddress
                    const messages = messagesPerStorageNode[nodeAddress]
                    yield* messages
                }
            } as any,
            undefined as any,
            mockLoggerFactory()
        )
        return resends
    }

    it('one storage node', async () => {
        const allMessages = [
            await messageFactory.createMessage({ foo: 1 }, { timestamp: 1000 }),
            await messageFactory.createMessage({ foo: 2 }, { timestamp: 2000 }),
            await messageFactory.createMessage({ foo: 3 }, { timestamp: 3000 })
        ]
        const storageNodeAddress = randomEthereumAddress()
        const resends = createResends({
            [storageNodeAddress]: [allMessages[0], allMessages[2]]
        })
        const messageStream = await resends.resend(STREAM_PART_ID, { last: 2 }, async () => [storageNodeAddress])
        const receivedMessages = await collect(messageStream)
        expect(receivedMessages.map((msg) => msg.content)).toEqual([
            { foo: 1 },
            { foo: 3 }
        ])
    })

    it('multiple storage nodes', async () => {
        const msg1 = await messageFactory.createMessage({ foo: 1 }, { timestamp: 1000 })
        const msg2 = await messageFactory.createMessage({ foo: 2 }, { timestamp: 2000 })
        const msg3 = await messageFactory.createMessage({ foo: 3 }, { timestamp: 3000 })
        const msg4 = await messageFactory.createMessage({ foo: 4 }, { timestamp: 4000 })
        const allMessages = [msg1, msg2, msg3, msg4]
        const storageNodeAddress1 = randomEthereumAddress()
        const storageNodeAddress2 = randomEthereumAddress()
        const resends = createResends({
            [storageNodeAddress1]: without(allMessages, msg2),
            [storageNodeAddress2]: without(allMessages, msg3)
        })
        const messageStream = await resends.resend(STREAM_PART_ID, { last: 4 }, async () => [storageNodeAddress1, storageNodeAddress2])
        const receivedMessages = await collect(messageStream)
        expect(receivedMessages.map((msg) => msg.content)).toEqual([
            { foo: 1 },
            { foo: 2 },
            { foo: 3 },
            { foo: 4 }
        ])
    })
})
