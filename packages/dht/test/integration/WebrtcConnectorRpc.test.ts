import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { WebrtcConnectorRpcClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'
import {
    IceCandidate,
    RtcAnswer,
    RtcOffer,
    WebrtcConnectionRequest
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { Empty } from '../../src/proto/google/protobuf/empty'
import { createMockPeerDescriptor } from '../utils/utils'
import { IWebrtcConnectorRpc } from '../../src/proto/packages/dht/protos/DhtRpc.server'
import { waitForCondition } from '@streamr/utils'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { DhtCallContext } from '../../src/rpc-protocol/DhtCallContext'

describe('WebRTC rpc messages', () => {

    let rpcCommunicator1: RpcCommunicator<DhtCallContext>
    let rpcCommunicator2: RpcCommunicator<DhtCallContext>
    let client: ProtoRpcClient<WebrtcConnectorRpcClient>
    let requestConnectionCounter: number
    let rtcOfferCounter: number
    let rtcAnswerCounter: number
    let iceCandidateCounter: number
    const targetDescriptor = createMockPeerDescriptor()

    beforeEach(() => {
        requestConnectionCounter = 0
        rtcOfferCounter = 0
        rtcAnswerCounter = 0
        iceCandidateCounter = 0

        rpcCommunicator1 = new RpcCommunicator()
        const serverFunctions: IWebrtcConnectorRpc = {

            requestConnection: async (): Promise<Empty> => {
                requestConnectionCounter += 1
                const res: Empty = {}
                return res
            },

            rtcOffer: async (): Promise<Empty> => {
                rtcOfferCounter += 1
                const res: Empty = {}
                return res
            },

            rtcAnswer: async (): Promise<Empty> => {
                rtcAnswerCounter += 1
                const res: Empty = {}
                return res
            },

            iceCandidate: async (): Promise<Empty> => {
                iceCandidateCounter += 1
                const res: Empty = {}
                return res
            }
        }

        rpcCommunicator2 = new RpcCommunicator()
        rpcCommunicator2.registerRpcNotification(RtcOffer, 'rtcOffer', serverFunctions.rtcOffer)
        rpcCommunicator2.registerRpcNotification(RtcAnswer, 'rtcAnswer', serverFunctions.rtcAnswer)
        rpcCommunicator2.registerRpcNotification(IceCandidate, 'iceCandidate', serverFunctions.iceCandidate)
        rpcCommunicator2.registerRpcNotification(WebrtcConnectionRequest, 'requestConnection', serverFunctions.requestConnection)

        rpcCommunicator1.on('outgoingMessage', (message: RpcMessage) => {
            rpcCommunicator2.handleIncomingMessage(message)
        })

        rpcCommunicator2.on('outgoingMessage', (message: RpcMessage) => {
            rpcCommunicator1.handleIncomingMessage(message)
        })

        client = toProtoRpcClient(new WebrtcConnectorRpcClient(rpcCommunicator1.getRpcClientTransport()))
    })

    afterEach(async () => {
        rpcCommunicator1.stop()
        rpcCommunicator2.stop()
    })

    it('send connectionRequest', async () => {
        client.requestConnection({
        },
        { targetDescriptor, notification: true }
        )

        await waitForCondition(() => requestConnectionCounter === 1)
    })

    it('send rtcOffer', async () => {
        client.rtcOffer({
            connectionId: 'rtcOffer',
            description: 'aaaaaa'
        },
        { targetDescriptor, notification: true }
        )

        await waitForCondition(() => rtcOfferCounter === 1)
    })

    it('send rtcAnswer', async () => {
        client.rtcAnswer({
            connectionId: 'rtcOffer',
            description: 'aaaaaa'
        },
        { targetDescriptor, notification: true }
        )

        await waitForCondition(() => rtcAnswerCounter === 1)
    })

    it('send iceCandidate', async () => {
        client.iceCandidate({
            connectionId: 'rtcOffer',
            candidate: 'aaaaaa',
            mid: 'asdasdasdasdasd'
        },
        { targetDescriptor, notification: true }
        )

        await waitForCondition(() => iceCandidateCounter === 1)
    })
})
