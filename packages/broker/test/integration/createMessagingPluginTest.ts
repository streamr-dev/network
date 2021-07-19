import { Stream, StreamrClient } from 'streamr-client'
import { startTracker, Tracker } from 'streamr-network'
import { Broker } from '../../src/broker'
import { Message } from '../helpers/PayloadFormat'
import { createClient, startBroker, createTestStream, createMockUser, Queue } from '../utils'

interface MessagingPluginApi<T> {
    createClient: (action: 'publish'|'subscribe', streamId: string, apiKey: string) => Promise<T>
    closeClient: (client: T) => Promise<void>
    publish: (message: Message, streamId: string, client: T) => Promise<void>,
    subscribe: (messageQueue: Queue<Message>, streamId: string, client: T) => Promise<void>
}

interface Ports {
    plugin: number,
    legacyWebsocket: number
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

const brokerUser = createMockUser()

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
) => {

    describe(`Plugin: ${pluginName}`, () => {

        let stream: Stream
        let streamrClient: StreamrClient
        let pluginClient: T
        let tracker: Tracker
        let broker: Broker
        let messageQueue: Queue<Message>

        beforeAll(async () => {
            tracker = await startTracker({
                id: 'tracker',
                host: '127.0.0.1',
                port: ports.tracker,
            })
            broker = await startBroker({
                name: 'broker',
                privateKey: brokerUser.privateKey,
                trackerPort: ports.tracker,
                wsPort: ports.legacyWebsocket,
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
            streamrClient = createClient(ports.legacyWebsocket, brokerUser.privateKey, {
                autoDisconnect: false
            })
            stream = await createTestStream(streamrClient, testModule)
            messageQueue = new Queue<Message>()
        })

        afterEach(async () => {
            if (pluginClient !== undefined) {
                await api.closeClient(pluginClient)
            }
            await streamrClient?.ensureDisconnected()
        })

        test('publish', async () => {
            streamrClient.subscribe(stream.id, (content: any, metadata: any) => {
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
            await streamrClient.publish(stream.id, MOCK_MESSAGE.content, MOCK_MESSAGE.metadata.timestamp)
            const message = await messageQueue.pop()
            assertReceivedMessage(message)
        })

    })

}