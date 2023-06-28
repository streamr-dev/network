import {
    MessageRef,
    StreamMessage,
    StreamMessageType,
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { Propagation } from '../../src/logic/propagation/Propagation'
import { toEthereumAddress, wait } from '@streamr/utils'

const PUBLISHER_ID = toEthereumAddress('0x1111111111111111111111111111111111111111')

function makeMsg(streamId: string, partition: number, ts: number, msgNo: number): StreamMessage {
    const ref: MessageRef = {
        streamId,
        streamPartition: partition,
        timestamp: ts,
        sequenceNumber: msgNo,
        messageChainId: 'msgChain',
        publisherId: PUBLISHER_ID
    }
    return {
        messageRef: ref,
        content: new Uint8Array([1]),
        signature: 'signature',
        messageType: StreamMessageType.MESSAGE
    }
}

const TTL = 100

describe(Propagation, () => {
    let getNeighbors: jest.Mock<ReadonlyArray<string>, [string]>
    let sendToNeighbor: jest.Mock<Promise<void>, [string, StreamMessage]>
    let propagation: Propagation

    beforeEach(() => {
        getNeighbors = jest.fn()
        sendToNeighbor = jest.fn()
        propagation = new Propagation({
            sendToNeighbor,
            randomGraphId: 's1#0',
            minPropagationTargets: 3,
            ttl: TTL,
            maxMessages: 5
        })
    })

    describe('#feedUnseenMessage', () => {
        it('message is propagated to nodes returned by getNeighbors', () => {
            getNeighbors.mockReturnValueOnce(['n1', 'n2', 'n3'])
            const msg = makeMsg('s1', 0, 1000, 1)
            propagation.feedUnseenMessage(msg, [...getNeighbors('s1#0')], null)

            expect(sendToNeighbor).toHaveBeenCalledTimes(3)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(1, 'n1', msg)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(2, 'n2', msg)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(3, 'n3', msg)
        })

        it('message does not get propagated to source node (if present in getNeighbors)', () => {
            getNeighbors.mockReturnValueOnce(['n1', 'n2', 'n3'])
            const msg = makeMsg('s1', 0, 1000, 1)
            propagation.feedUnseenMessage(msg, [...getNeighbors('s1#0')], 'n2')

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
            propagation.feedUnseenMessage(msg, [...getNeighbors('s1#0')], 'n2')
            await wait(0)
            sendToNeighbor.mockClear()
            getNeighbors.mockClear()
        }

        it('sends to new neighbor', async () => {
            await setUpAndFeed(['n1', 'n2', 'n3'])
            propagation.onNeighborJoined('n4')
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
            propagation.onNeighborJoined('n3')
            expect(sendToNeighbor).toHaveBeenCalledTimes(1)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(1, 'n3', msg)
        })

        it('no-op if passed source node', async () => {
            await setUpAndFeed(['n1', 'n2', 'n3'])
            propagation.onNeighborJoined('n2')
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if passed already handled neighbor', async () => {
            await setUpAndFeed(['n1', 'n2', 'n3'])
            propagation.onNeighborJoined('n3')
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if initially `minPropagationTargets` were propagated to', async () => {
            await setUpAndFeed(['n1', 'n2', 'n3', 'n4'])
            propagation.onNeighborJoined('n5')
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if later `minPropagationTargets` have been propagated to', async () => {
            await setUpAndFeed(['n1', 'n2', 'n3'])
            propagation.onNeighborJoined('n4')
            await wait(0)
            sendToNeighbor.mockClear()
            propagation.onNeighborJoined('n5')
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if TTL expires', async () => {
            await setUpAndFeed(['n1', 'n2', 'n3'])
            await wait(200)
            propagation.onNeighborJoined('n3')
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })
    })
})
