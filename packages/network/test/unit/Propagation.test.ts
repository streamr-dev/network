import { Propagation } from '../../src/logic/node/propagation/Propagation'
import { NodeId } from '../../src/logic/node/Node'
import { StreamIdAndPartition } from '../../src/identifiers'
import { MessageIDStrict, StreamMessage } from 'streamr-client-protocol'

function makeMsg(streamId: string, partition: number, ts: number, msgNo: number): StreamMessage {
    return new StreamMessage({
        messageId: new MessageIDStrict(streamId, partition, ts, 0, 'publisher', 'msgChain'),
        content: {
            msgNo
        }
    })
}

describe(Propagation, () => {
    let getNeighbors: jest.Mock<ReadonlyArray<NodeId>, [StreamIdAndPartition]>
    let sendToNeighbor: jest.Mock<Promise<unknown>, [string, StreamMessage]>
    let propagation: Propagation

    beforeEach(() => {
        getNeighbors = jest.fn()
        sendToNeighbor = jest.fn()
        propagation = new Propagation({
            getNeighbors,
            sendToNeighbor,
            minPropagationTargets: 3,
            ttl: 100,
            maxConcurrentMessages: 5
        })
    })

    describe('#feedUnseenMessage', () => {
        it('message is propagated to nodes returned by getNeighbors', () => {
            getNeighbors.mockReturnValueOnce(['n1', 'n2', 'n3'])
            const msg = makeMsg('s1', 0, 1000, 1)
            propagation.feedUnseenMessage(msg, null)

            expect(sendToNeighbor).toHaveBeenCalledTimes(3)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(1, 'n1', msg)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(2, 'n2', msg)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(3, 'n3', msg)
        })

        it('message does not get propagated to source node (if present in getNeighbors)', () => {
            getNeighbors.mockReturnValueOnce(['n1', 'n2', 'n3'])
            const msg = makeMsg('s1', 0, 1000, 1)
            propagation.feedUnseenMessage(msg, 'n2')

            expect(sendToNeighbor).toHaveBeenCalledTimes(2)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(1, 'n1', msg)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(2, 'n3', msg)
        })
    })

    describe('#onNeighborJoined', () => {
        let msg: StreamMessage

        function setUpAndFeed(neighbors: string[], neighborRejectList: string[]) {
            getNeighbors.mockReturnValueOnce(neighbors)
            sendToNeighbor.mockImplementation(async (neighbor: string) => {
                if (neighborRejectList.includes(neighbor)) {
                    throw new Error('failed to send')
                }
            })
            msg = makeMsg('s1', 0, 1000, 1)
            propagation.feedUnseenMessage(msg, 'n2')
            sendToNeighbor.mockClear()
            getNeighbors.mockClear()
        }

        it('no-op if passed non-existing stream', () => {
            setUpAndFeed(['n1', 'n2', 'n3'], [])
            propagation.onNeighborJoined('n4', new StreamIdAndPartition('non-existing-stream', 0))
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if passed source node', () => {
            setUpAndFeed(['n1', 'n2', 'n3'], [])
            propagation.onNeighborJoined('n2', new StreamIdAndPartition('s1', 0))
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if passed already handled neighbor', () => {
            setUpAndFeed(['n1', 'n2', 'n3'], [])
            propagation.onNeighborJoined('n3', new StreamIdAndPartition('s1', 0))
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if initially `minPropagationTargets` were propagated to', () => {
            setUpAndFeed(['n1', 'n2', 'n3', 'n4'], [])
            propagation.onNeighborJoined('n5', new StreamIdAndPartition('s1', 0))
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('sends to new neighbor', () => {
            setUpAndFeed(['n1', 'n2', 'n3'], [])
            propagation.onNeighborJoined('n4', new StreamIdAndPartition('s1', 0))
            expect(sendToNeighbor).toHaveBeenCalledTimes(1)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(1, 'n4', msg)
        })

        it('sends to old neighbor if initial propagation failed', () => {
            setUpAndFeed(['n1', 'n2', 'n3', 'n666'], ['n666'])
            propagation.onNeighborJoined('n666', new StreamIdAndPartition('s1', 0))
            expect(sendToNeighbor).toHaveBeenCalledTimes(1)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(1, 'n666', msg)
        })

        it('sends to old neighbor if re-attempt propagation failed', () => {
            setUpAndFeed(['n1', 'n2', 'n3'], [])
            sendToNeighbor.mockRejectedValueOnce(new Error('failed to send (again)'))
            propagation.onNeighborJoined('n666', new StreamIdAndPartition('s1', 0))
            expect(sendToNeighbor).toHaveBeenCalledTimes(1) // sanity check
            sendToNeighbor.mockClear()

            propagation.onNeighborJoined('n666', new StreamIdAndPartition('s1', 0))
            expect(sendToNeighbor).toHaveBeenCalledTimes(1)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(1, 'n666', msg)
        })
    })
})