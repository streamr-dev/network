import { ITransport } from '../../src/transport/ITransport'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { WebRtcConnectorClient } from '../../src/proto/DhtRpc.client'
import { Simulator } from '../../src/connection/Simulator'
import { Message, PeerDescriptor } from '../../src/proto/DhtRpc'
import { generateId } from '../../src/helpers/common'
import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import { createRemoteWebRtcConnectorServer } from '../../src/connection/WebRTC/RemoteWebrtcConnector'
import { waitForCondition } from 'streamr-test-utils'

describe('WebRTC rpc messages', () => {
    let mockConnectionLayer1: ITransport,
        mockConnectionLayer2: ITransport,
        rpcCommunicator1: RpcCommunicator,
        rpcCommunicator2: RpcCommunicator,
        client: WebRtcConnectorClient

    const simulator = new Simulator()

    let requestConnectionCounter: number
    let rtcOfferCounter: number
    let rtcAnswerCounter: number
    let iceCandidateCounter: number

    const peerDescriptor1: PeerDescriptor = {
        peerId: generateId('peer1'),
        type: 0
    }

    const peerDescriptor2: PeerDescriptor = {
        peerId: generateId('peer2'),
        type: 0
    }

    beforeEach(() => {
        requestConnectionCounter = 0
        rtcOfferCounter = 0
        rtcAnswerCounter = 0
        iceCandidateCounter = 0

        mockConnectionLayer1 = new MockConnectionManager(peerDescriptor1, simulator)
        rpcCommunicator1 = new RpcCommunicator({
            connectionLayer: mockConnectionLayer1,
            appId: "webrtc"
        })
        const serverFunctions = createRemoteWebRtcConnectorServer(
            () => { rtcOfferCounter += 1 },
            () => { rtcAnswerCounter += 1 },
            () => { iceCandidateCounter += 1 },
            () => { requestConnectionCounter += 1 }
        )

        mockConnectionLayer2 = new MockConnectionManager(peerDescriptor2, simulator)
        rpcCommunicator2 = new RpcCommunicator({
            connectionLayer: mockConnectionLayer2,
            appId: "webrtc"
        })
        rpcCommunicator2.registerServerMethod('rtcOffer', serverFunctions.rtcOffer)
        rpcCommunicator2.registerServerMethod('rtcAnswer', serverFunctions.rtcAnswer)
        rpcCommunicator2.registerServerMethod('iceCandidate', serverFunctions.iceCandidate)
        rpcCommunicator2.registerServerMethod('requestConnection', serverFunctions.requestConnection)

        rpcCommunicator1.setSendFn((peerDescriptor: PeerDescriptor, message: Message) => {
            rpcCommunicator2.onIncomingMessage(peerDescriptor, message)
        })

        rpcCommunicator2.setSendFn((peerDescriptor: PeerDescriptor, message: Message) => {
            rpcCommunicator1.onIncomingMessage(peerDescriptor, message)
        })

        client = new WebRtcConnectorClient(rpcCommunicator1.getRpcClientTransport())
    })

    afterEach(async () => {
        await rpcCommunicator1.stop()
        await rpcCommunicator2.stop()
    })

    it('send connectionRequest', async () => {
        const response = client.requestConnection({
            requester: peerDescriptor1,
            target: peerDescriptor2,
            connectionId: 'connectionRequest'
        },
        { targetDescriptor: peerDescriptor2, notification: true }
        )
        const res = await response.response
        await (expect(res.sent)).toEqual(true)
        await waitForCondition(() => requestConnectionCounter === 1)
    })

    it('send rtcOffer', async () => {
        const response = client.rtcOffer({
            requester: peerDescriptor1,
            target: peerDescriptor2,
            connectionId: 'rtcOffer',
            description: 'aaaaaa'
        },
        { targetDescriptor: peerDescriptor2, notification: true }
        )
        const res = await response.response
        await (expect(res.sent)).toEqual(true)
        await waitForCondition(() => rtcOfferCounter === 1)
    })

    it('send rtcAnswer', async () => {
        const response = client.rtcAnswer({
            requester: peerDescriptor1,
            target: peerDescriptor2,
            connectionId: 'rtcOffer',
            description: 'aaaaaa'
        },
        { targetDescriptor: peerDescriptor2, notification: true }
        )
        const res = await response.response
        await (expect(res.sent)).toEqual(true)
        await waitForCondition(() => rtcAnswerCounter === 1)
    })

    it('send iceCandidate', async () => {
        const response = client.iceCandidate({
            requester: peerDescriptor1,
            target: peerDescriptor2,
            connectionId: 'rtcOffer',
            candidate: 'aaaaaa',
            mid: 'asdasdasdasdasd'
        },
        { targetDescriptor: peerDescriptor2, notification: true }
        )
        const res = await response.response
        await (expect(res.sent)).toEqual(true)
        await waitForCondition(() => iceCandidateCounter === 1)
    })
})