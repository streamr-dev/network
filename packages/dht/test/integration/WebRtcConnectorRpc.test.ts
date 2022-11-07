import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { WebRtcConnectorServiceClient } from '../../src/proto/DhtRpc.client'
import {
    IceCandidate,
    PeerDescriptor,
    RtcAnswer,
    RtcOffer,
    WebRtcConnectionRequest
} from '../../src/proto/DhtRpc'
import { Empty } from '../../src/proto/google/protobuf/empty'
import { generateId } from '../utils'
import { waitForCondition } from '@streamr/test-utils'
import { IWebRtcConnectorService } from '../../src/proto/DhtRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../../src/rpc-protocol/DhtCallContext'

describe('WebRTC rpc messages', () => {
    let rpcCommunicator1: RpcCommunicator
    let rpcCommunicator2: RpcCommunicator
    let client: ProtoRpcClient<WebRtcConnectorServiceClient>

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

        rpcCommunicator1 = new RpcCommunicator()
        const serverFunctions: IWebRtcConnectorService = {

            requestConnection: async (_urequest: WebRtcConnectionRequest, _context: ServerCallContext): Promise<Empty> => {
                requestConnectionCounter += 1
                const res: Empty = {}
                return res
            },

            rtcOffer: async (_urequest: RtcOffer, _context: ServerCallContext): Promise<Empty> => {
                rtcOfferCounter += 1
                const res: Empty = {}
                return res
            },

            rtcAnswer: async (_urequest: RtcAnswer, _context: ServerCallContext): Promise<Empty> => {
                rtcAnswerCounter += 1
                const res: Empty = {}
                return res
            },

            iceCandidate: async (_urequest: IceCandidate, _context: ServerCallContext): Promise<Empty> => {
                iceCandidateCounter += 1
                const res: Empty = {}
                return res
            }
        }

        rpcCommunicator2 = new RpcCommunicator()
        rpcCommunicator2.registerRpcNotification(RtcOffer, 'rtcOffer', serverFunctions.rtcOffer)
        rpcCommunicator2.registerRpcNotification(RtcAnswer, 'rtcAnswer', serverFunctions.rtcAnswer)
        rpcCommunicator2.registerRpcNotification(IceCandidate, 'iceCandidate', serverFunctions.iceCandidate)
        rpcCommunicator2.registerRpcNotification(WebRtcConnectionRequest, 'requestConnection', serverFunctions.requestConnection)

        rpcCommunicator1.on('outgoingMessage', (message: Uint8Array, _ucallContext?: DhtCallContext) => {
            rpcCommunicator2.handleIncomingMessage(message)
        })

        rpcCommunicator2.on('outgoingMessage', (message: Uint8Array, _ucallContext?: DhtCallContext) => {
            rpcCommunicator1.handleIncomingMessage(message)
        })

        client = toProtoRpcClient(new WebRtcConnectorServiceClient(rpcCommunicator1.getRpcClientTransport()))
    })

    afterEach(async () => {
        await rpcCommunicator1.stop()
        await rpcCommunicator2.stop()
    })

    it('send connectionRequest', async () => {
        client.requestConnection({
            requester: peerDescriptor1,
            target: peerDescriptor2,
            connectionId: 'connectionRequest'
        },
        { targetDescriptor: peerDescriptor2, notification: true }
        )

        await waitForCondition(() => requestConnectionCounter === 1)
    })

    it('send rtcOffer', async () => {
        client.rtcOffer({
            requester: peerDescriptor1,
            target: peerDescriptor2,
            connectionId: 'rtcOffer',
            description: 'aaaaaa'
        },
        { targetDescriptor: peerDescriptor2, notification: true }
        )

        await waitForCondition(() => rtcOfferCounter === 1)
    })

    it('send rtcAnswer', async () => {
        client.rtcAnswer({
            requester: peerDescriptor1,
            target: peerDescriptor2,
            connectionId: 'rtcOffer',
            description: 'aaaaaa'
        },
        { targetDescriptor: peerDescriptor2, notification: true }
        )

        await waitForCondition(() => rtcAnswerCounter === 1)
    })

    it('send iceCandidate', async () => {
        client.iceCandidate({
            requester: peerDescriptor1,
            target: peerDescriptor2,
            connectionId: 'rtcOffer',
            candidate: 'aaaaaa',
            mid: 'asdasdasdasdasd'
        },
        { targetDescriptor: peerDescriptor2, notification: true }
        )

        await waitForCondition(() => iceCandidateCounter === 1)
    })
})
