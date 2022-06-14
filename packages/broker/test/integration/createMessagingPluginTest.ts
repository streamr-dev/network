import { Wallet } from '@ethersproject/wallet'
import { Stream, StreamrClient } from 'streamr-client'
import { Tracker } from '@streamr/network-tracker'
import { Queue } from 'streamr-test-utils'
import { Broker } from '../../src/broker'
import { Message } from '../../src/helpers/PayloadFormat'
import { createClient, startBroker, createTestStream, fetchPrivateKeyWithGas, startTestTracker } from '../utils'
import { wait } from 'streamr-test-utils'

interface MessagingPluginApi<T> {
    createClient: (action: 'publish'|'subscribe', streamId: string, apiKey: string) => Promise<T>
    closeClient: (client: T) => Promise<void>
    publish: (message: Message, streamId: string, client: T) => Promise<void>,
    subscribe: (messageQueue: Queue<Message>, streamId: string, client: T) => Promise<void>
}

interface Ports {
    plugin: number,
    tracker: number
}

const MOCK_MESSAGE = {
    content: {
        foo: 'bar'
    },
    metadata: {
        timestamp: 11111111
    }
}
const MOCK_API_KEY = 'mock-api-key'
let brokerUser: Wallet

const assertReceivedMessage = (message: Message) => {
    const { content, metadata } = message
    expect(content).toEqual(MOCK_MESSAGE.content)
    expect(metadata.timestamp).toEqual(MOCK_MESSAGE.metadata.timestamp)
    expect(metadata.sequenceNumber).toEqual(0)
    expect(metadata.publisherId).toEqual(brokerUser.address.toLocaleLowerCase())
    expect(metadata.msgChainId).toBeDefined()
}

export const createMessagingPluginTest = <T>(
    pluginName: string,
    api: MessagingPluginApi<T>,
    ports: Ports,
    testModule: NodeJS.Module,
    pluginConfig: any = {}
): any => {

    describe(`Plugin: ${pluginName}`, () => {

        let stream: Stream
        let streamrClient: StreamrClient
        let pluginClient: T
        let tracker: Tracker
        let broker: Broker
        let messageQueue: Queue<Message>

        beforeAll(async () => {
            brokerUser = new Wallet(await fetchPrivateKeyWithGas())
            tracker = await startTestTracker(ports.tracker)
            broker = await startBroker({
                privateKey: brokerUser.privateKey,
                trackerPort: ports.tracker,
                apiAuthentication: {
                    keys: [MOCK_API_KEY]
                },
                extraPlugins: {
                    [pluginName]: {
                        port: ports.plugin,
                        payloadMetadata: true,
                        ...pluginConfig
                    }
                }
            })
        })

        afterAll(async () => {
            await Promise.allSettled([
                broker.stop(),
                tracker.stop()
            ])
        })

        beforeEach(async () => {
            streamrClient = await createClient(tracker, brokerUser.privateKey)
            stream = await createTestStream(streamrClient, testModule)
            messageQueue = new Queue<Message>()
        })

        afterEach(async () => {
            if (pluginClient !== undefined) {
                await api.closeClient(pluginClient)
            }
            await streamrClient?.destroy()
        })

        describe('happy path', () => {
            test('publish', async () => {
                await streamrClient.subscribe(stream.id, (content: any, metadata: any) => {
                    messageQueue.push({ content, metadata: metadata.messageId })
                })
                pluginClient = await api.createClient('publish', stream.id, MOCK_API_KEY)
                await api.publish(MOCK_MESSAGE, stream.id, pluginClient)
                const message = await messageQueue.pop()
                assertReceivedMessage(message)
            })
    
            test('subscribe', async () => {
                pluginClient = await api.createClient('subscribe', stream.id, MOCK_API_KEY)
                await api.subscribe(messageQueue, stream.id, pluginClient)
                await streamrClient.publish(stream.id, MOCK_MESSAGE.content, {
                    timestamp: MOCK_MESSAGE.metadata.timestamp
                })
                const message = await messageQueue.pop()
                assertReceivedMessage(message)
            })
        })

        it('publish to non-existent stream', async () => {
            const streamId = 'non-existent-stream'
            pluginClient = await api.createClient('publish', streamId, MOCK_API_KEY)
            await api.publish(MOCK_MESSAGE, streamId, pluginClient)
            // Wait for some time so that the plugin can handle the publish request (api.publish() 
            // resolves immediately e.g. in websocket plugin test as websocket.send() doesn't 
            // return a promise). 
            // If the api.publish call causes the plugin to throw an unhandled error, jest catches 
            // the error and this test fails. There should be "Unable to publish" warning in the 
            // Broker log, but this test can't verify it. 
            await wait(1000)
        })
    })
}
