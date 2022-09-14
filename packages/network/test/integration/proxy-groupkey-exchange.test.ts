import { NetworkNode } from '../../src/logic/NetworkNode'
import { startTracker, Tracker } from '@streamr/network-tracker'
import { createNetworkNode } from '../../src/createNetworkNode'
import {
    GroupKeyRequest, GroupKeyResponse, MessageID,
    ProxyDirection,
    SmartContractRecord,
    StreamMessage, StreamMessageType,
    StreamPartIDUtils
} from 'streamr-client-protocol'
import { waitForEvent } from '@streamr/utils'
import { Event as NodeEvent } from '../../src/logic/Node'

describe('GroupKey exchange via proxy connections', () => {
    let publisher: NetworkNode
    let subscriber: NetworkNode
    let proxy: NetworkNode
    let tracker: Tracker
    let trackerInfo: SmartContractRecord

    const publisherIdentity = 'publisher-ethereum-address'
    const subscriberIdentity = 'subscriber-ethereum-address'

    const streamPartId = StreamPartIDUtils.parse('stream-0#0')

    beforeEach(async () => {

        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 30999
            }
        })
        trackerInfo = tracker.getConfigRecord()

        proxy = createNetworkNode({
            id: 'proxy-node',
            trackers: [trackerInfo],
            stunUrls: [],
            acceptProxyConnections: true,
            webrtcDisallowPrivateAddresses: false
        })
        await proxy.start()

        publisher = createNetworkNode({
            id: 'publisher',
            trackers: [trackerInfo],
            stunUrls: [],
            webrtcDisallowPrivateAddresses: false
        })
        await publisher.start()

        subscriber = createNetworkNode({
            id: 'subscriber',
            trackers: [trackerInfo],
            stunUrls: [],
            webrtcDisallowPrivateAddresses: false
        })
        await subscriber.start()

        await proxy.subscribeAndWaitForJoin(streamPartId)
    })

    afterEach(async () => {
        await Promise.all([
            tracker.stop(),
            proxy.stop(),
            publisher.stop(),
            subscriber.stop()
        ])
    })

    it('happy path request', async () => {
        await publisher.openProxyConnection(streamPartId, 'proxy-node', ProxyDirection.PUBLISH, publisherIdentity)
        await subscriber.openProxyConnection(streamPartId, 'proxy-node', ProxyDirection.SUBSCRIBE, subscriberIdentity)

        const requestContent = new GroupKeyRequest({
            recipient: publisherIdentity,
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
                subscriberIdentity,
                '0'
            ),
            messageType: StreamMessageType.GROUP_KEY_REQUEST,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            content: requestContent,
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
        })

        await Promise.all([
            waitForEvent(publisher, NodeEvent.UNSEEN_MESSAGE_RECEIVED),
            subscriber.publish(request)
        ])

    })

    it('happy path response', async () => {
        await publisher.openProxyConnection(streamPartId, 'proxy-node', ProxyDirection.PUBLISH, publisherIdentity)
        await subscriber.openProxyConnection(streamPartId, 'proxy-node', ProxyDirection.SUBSCRIBE, subscriberIdentity)

        const responseContent = new GroupKeyResponse({
            recipient: publisherIdentity,
            requestId: 'requestId',
            encryptedGroupKeys: []
        }).toArray()
        const response = new StreamMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(streamPartId),
                StreamPartIDUtils.getStreamPartition(streamPartId),
                Date.now(),
                0,
                publisherIdentity,
                '0'
            ),
            messageType: StreamMessageType.GROUP_KEY_RESPONSE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
            content: responseContent,
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
        })

        await Promise.all([
            waitForEvent(subscriber, NodeEvent.UNSEEN_MESSAGE_RECEIVED),
            publisher.publish(response)
        ])
    })
})
