import { MessageID, StreamPartID, StreamMessage, StreamPartIDUtils, toStreamID } from 'streamr-client-protocol'
import { Propagation } from '../../src/logic/propagation/Propagation'
import { NodeId } from '../../src/identifiers'
import { wait } from '@streamr/utils'

function makeMsg(streamId: string, partition: number, ts: number, msgNo: number): StreamMessage {
    return new StreamMessage({
        messageId: new MessageID(toStreamID(streamId), partition, ts, 0, 'publisher', 'msgChain'),
        content: {
            msgNo
        }
    })
}

const TTL = 100

describe(Propagation, () => {
    let getNeighbors: jest.Mock<ReadonlyArray<NodeId>, [StreamPartID]>
    let sendToNeighbor: jest.Mock<Promise<void>, [string, StreamMessage]>
    let propagation: Propagation

    beforeEach(() => {
        getNeighbors = jest.fn()
        sendToNeighbor = jest.fn()
        propagation = new Propagation({
            getNeighbors,
            sendToNeighbor,
            minPropagationTargets: 3,
            ttl: TTL,
            maxMessages: 5
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

        async function setUpAndFeed(neighbors: string[]): Promise<void> {
            getNeighbors.mockReturnValueOnce(neighbors)
            msg = makeMsg('s1', 0, 1000, 1)
            propagation.feedUnseenMessage(msg, 'n2')
            await wait(0)
            sendToNeighbor.mockClear()
            getNeighbors.mockClear()
        }

        it('sends to new neighbor', async () => {
            await setUpAndFeed(['n1', 'n2', 'n3'])
            propagation.onNeighborJoined('n4', StreamPartIDUtils.parse('s1#0'))
            expect(sendToNeighbor).toHaveBeenCalledTimes(1)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(1, 'n4', msg)
        })

        it('sends to previously failed neighbor', async () => {
            sendToNeighbor.mockImplementation(async (neighbor) => {
                if (neighbor === 'n3') {
                    throw new Error('failed to send')
                }
            })
            await setUpAndFeed(['n1', 'n2', 'n3'])
            propagation.onNeighborJoined('n3', StreamPartIDUtils.parse('s1#0'))
            expect(sendToNeighbor).toHaveBeenCalledTimes(1)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(1, 'n3', msg)
        })

        it('no-op if passed non-existing stream', async () => {
            await setUpAndFeed(['n1', 'n2', 'n3'])
            propagation.onNeighborJoined('n4', StreamPartIDUtils.parse('non-existing-stream#0'))
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if passed source node', async () => {
            await setUpAndFeed(['n1', 'n2', 'n3'])
            propagation.onNeighborJoined('n2', StreamPartIDUtils.parse('s1#0'))
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if passed already handled neighbor', async () => {
            await setUpAndFeed(['n1', 'n2', 'n3'])
            propagation.onNeighborJoined('n3', StreamPartIDUtils.parse('s1#0'))
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if initially `minPropagationTargets` were propagated to', async () => {
            await setUpAndFeed(['n1', 'n2', 'n3', 'n4'])
            propagation.onNeighborJoined('n5', StreamPartIDUtils.parse('s1#0'))
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if later `minPropagationTargets` have been propagated to', async () => {
            await setUpAndFeed(['n1', 'n2', 'n3'])
            propagation.onNeighborJoined('n4', StreamPartIDUtils.parse('s1#0'))
            await wait(0)
            sendToNeighbor.mockClear()
            propagation.onNeighborJoined('n5', StreamPartIDUtils.parse('s1#0'))
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if TTL expires', async () => {
            await setUpAndFeed(['n1', 'n2', 'n3'])
            await wait(TTL + 1)
            propagation.onNeighborJoined('n4', StreamPartIDUtils.parse('s1#0'))
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })
    })
})
