import { NetworkNode } from '../../src/logic/NetworkNode'
import { startTracker, Tracker } from '@streamr/network-tracker'
import {
    EncryptionType,
    GroupKeyRequest,
    GroupKeyResponse,
    MessageID,
    ProxyDirection,
    TrackerRegistryRecord,
    StreamMessage,
    StreamMessageType,
    StreamPartIDUtils,
} from '@streamr/protocol'
import { toEthereumAddress, waitForEvent } from '@streamr/utils'
import { Event as NodeEvent } from '../../src/logic/Node'
import { createTestNetworkNode } from '../utils'

describe('GroupKey exchange via proxy connections', () => {
    let publisher: NetworkNode
    let subscriber: NetworkNode
    let proxy: NetworkNode
    let tracker: Tracker
    let trackerInfo: TrackerRegistryRecord

    const publisherUserId = toEthereumAddress('0x823A026e226EB47980c88616e01E1D3305Ef8Ecb')
    const subscriberUserId = toEthereumAddress('0x73E6183bf9b79D30533bEC7B28e982e9Af649B23')

    const streamPartId = StreamPartIDUtils.parse('stream-0#0')

    beforeEach(async () => {

        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 30999
            }
        })
        trackerInfo = tracker.getConfigRecord()

        proxy = createTestNetworkNode({
            id: 'proxy-node',
            trackers: [trackerInfo],
            iceServers: [],
            acceptProxyConnections: true,
            webrtcDisallowPrivateAddresses: false
        })
        await proxy.start()

        publisher = createTestNetworkNode({
            id: 'publisher',
            trackers: [trackerInfo],
            iceServers: [],
            webrtcDisallowPrivateAddresses: false
        })
        await publisher.start()

        subscriber = createTestNetworkNode({
            id: 'subscriber',
            trackers: [trackerInfo],
            iceServers: [],
            webrtcDisallowPrivateAddresses: false
        })
        await subscriber.start()

        await proxy.subscribeAndWaitForJoin(streamPartId)
    })

    afterEach(async () => {
        await Promise.all([
            tracker?.stop(),
            proxy?.stop(),
            publisher?.stop(),
            subscriber?.stop()
        ])
    })

    it('happy path request', async () => {
        await publisher.openProxyConnection(streamPartId, 'proxy-node', ProxyDirection.PUBLISH, publisherUserId)
        await subscriber.openProxyConnection(streamPartId, 'proxy-node', ProxyDirection.SUBSCRIBE, subscriberUserId)

        const requestContent = new GroupKeyRequest({
            recipient: publisherUserId,
            requestId: 'requestId',
            rsaPublicKey: 'mockKey',
            groupKeyIds: [
                'mock'
            ],
        }).toArray()
        const request = new StreamMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(streamPartId),
                StreamPartIDUtils.getStreamPartition(streamPartId),
                Date.now(),
                0,
                subscriberUserId,
                '0'
            ),
            messageType: StreamMessageType.GROUP_KEY_REQUEST,
            encryptionType: EncryptionType.NONE,
            content: requestContent,
            signature: 'signature'
        })

        await Promise.all([
            waitForEvent(publisher, NodeEvent.UNSEEN_MESSAGE_RECEIVED),
            subscriber.publish(request)
        ])

    })

    it('happy path response', async () => {
        await publisher.openProxyConnection(streamPartId, 'proxy-node', ProxyDirection.PUBLISH, publisherUserId)
        await subscriber.openProxyConnection(streamPartId, 'proxy-node', ProxyDirection.SUBSCRIBE, subscriberUserId)

        const responseContent = new GroupKeyResponse({
            recipient: publisherUserId,
            requestId: 'requestId',
            encryptedGroupKeys: []
        }).toArray()
        const response = new StreamMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(streamPartId),
                StreamPartIDUtils.getStreamPartition(streamPartId),
                Date.now(),
                0,
                publisherUserId,
                '0'
            ),
            messageType: StreamMessageType.GROUP_KEY_RESPONSE,
            encryptionType: EncryptionType.RSA,
            content: responseContent,
            signature: 'signature'
        })

        await Promise.all([
            waitForEvent(subscriber, NodeEvent.UNSEEN_MESSAGE_RECEIVED),
            publisher.publish(response)
        ])
    })
})
