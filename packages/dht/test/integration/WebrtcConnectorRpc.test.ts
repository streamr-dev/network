import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { WebrtcConnectorRpcClient } from '../../generated/packages/dht/protos/DhtRpc.client'
import { IceCandidate, RtcAnswer, RtcOffer, WebrtcConnectionRequest } from '../../generated/packages/dht/protos/DhtRpc'
import { Empty } from '../../generated/google/protobuf/empty'
import { createMockPeerDescriptor } from '../utils/utils'
import { IWebrtcConnectorRpc } from '../../generated/packages/dht/protos/DhtRpc.server'
import { until } from '@streamr/utils'
import { RpcMessage } from '../../generated/packages/proto-rpc/protos/ProtoRpc'
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
        rpcCommunicator2.registerRpcNotification(
            WebrtcConnectionRequest,
            'requestConnection',
            serverFunctions.requestConnection
        )

        rpcCommunicator1.setOutgoingMessageListener(async (message: RpcMessage) => {
            rpcCommunicator2.handleIncomingMessage(message, new DhtCallContext())
        })

        rpcCommunicator2.setOutgoingMessageListener(async (message: RpcMessage) => {
            rpcCommunicator1.handleIncomingMessage(message, new DhtCallContext())
        })

        client = toProtoRpcClient(new WebrtcConnectorRpcClient(rpcCommunicator1.getRpcClientTransport()))
    })

    afterEach(async () => {
        rpcCommunicator1.stop()
        rpcCommunicator2.stop()
    })

    it('send connectionRequest', async () => {
        client.requestConnection({}, { targetDescriptor, notification: true })

        await until(() => requestConnectionCounter === 1)
    })

    it('send rtcOffer', async () => {
        client.rtcOffer(
            {
                connectionId: 'rtcOffer',
                description: 'aaaaaa'
            },
            { targetDescriptor, notification: true }
        )

        await until(() => rtcOfferCounter === 1)
    })

    it('send rtcAnswer', async () => {
        client.rtcAnswer(
            {
                connectionId: 'rtcOffer',
                description: 'aaaaaa'
            },
            { targetDescriptor, notification: true }
        )

        await until(() => rtcAnswerCounter === 1)
    })

    it('send iceCandidate', async () => {
        client.iceCandidate(
            {
                connectionId: 'rtcOffer',
                candidate: 'aaaaaa',
                mid: 'asdasdasdasdasd'
            },
            { targetDescriptor, notification: true }
        )

        await until(() => iceCandidateCounter === 1)
    })
})
