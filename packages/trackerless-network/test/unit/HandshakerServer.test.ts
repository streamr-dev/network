import { PeerID } from "@streamr/dht"
import { HandshakerServer } from "../../src/logic/neighbor-discovery/HandshakerServer"
import { PeerList } from "../../src/logic/PeerList"
import { InterleaveNotice, StreamHandshakeRequest } from "../../src/proto/packages/trackerless-network/protos/NetworkRpc"
import { mockConnectionLocker } from '../utils/utils'

describe('HandshakerServer', () => {

    let handshakerServer: HandshakerServer

    const peerId = PeerID.fromString('Handshaker')

    let targetNeighbors: PeerList
    let handleRequest: jest.Mock
    let interleaveHandshake: jest.Mock

    beforeEach(() => {
        targetNeighbors = new PeerList(peerId, 10)

        handleRequest = jest.fn()
        interleaveHandshake = jest.fn()

        handshakerServer = new HandshakerServer({
            randomGraphId: 'random-graph',
            connectionLocker: mockConnectionLocker,
            handleRequest,
            interleaveHandshake: async () => {
                interleaveHandshake()
                return true
            },
            targetNeighbors,
        })
    })

    it('handshake', async () => {
        const req = StreamHandshakeRequest.create({
            randomGraphId: 'random-graph',
            senderId: 'senderId',
            requestId: 'requestId'
        })
        await handshakerServer.handshake(req, {} as any)
        expect(handleRequest).toHaveBeenCalledTimes(1)
    })

    it('interleaveHandshake success', async () => {
        const req: InterleaveNotice = {
            randomGraphId: 'random-graph',
            senderId: 'senderId',
            interleaveTarget: {
                kademliaId: PeerID.fromString('interleaveTarget').value,
                type: 0
            }

        }
        await handshakerServer.interleaveNotice(req, {} as any)
        expect(interleaveHandshake).toHaveBeenCalledTimes(1)
    })

    it('interleaveHandshake success', async () => {
        const req: InterleaveNotice = {
            randomGraphId: 'wrong-random-graph',
            senderId: 'senderId',
            interleaveTarget: {
                kademliaId: PeerID.fromString('interleaveTarget').value,
                type: 0
            }

        }
        await handshakerServer.interleaveNotice(req, {} as any)
        expect(interleaveHandshake).toHaveBeenCalledTimes(0)
    })

})
