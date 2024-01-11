import {
    ContentType,
    EncryptionType,
    MessageID,
    SignatureType,
    StreamMessage,
    StreamMessageType,
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { Propagation } from '../../src/logic/propagation/Propagation'
import { hexToBinary, toEthereumAddress, utf8ToBinary, wait } from '@streamr/utils'
import { DhtAddress } from '@streamr/dht'

const PUBLISHER_ID = toEthereumAddress('0x1111111111111111111111111111111111111111')

function makeMsg(streamId: string, partition: number, ts: number, msgNo: number): StreamMessage {
    const messageId: MessageID = {
        streamId,
        streamPartition: partition,
        timestamp: ts,
        sequenceNumber: msgNo,
        messageChainId: 'msgChain',
        publisherId: utf8ToBinary(PUBLISHER_ID)
    }
    return {
        messageId,
        content: new Uint8Array([1]),
        contentType: ContentType.JSON,
        encryptionType: EncryptionType.NONE,
        signature: hexToBinary('0x1111'),
        messageType: StreamMessageType.MESSAGE,
        signatureType: SignatureType.NEW_SECP256K1
    }
}

const TTL = 100

const N1 = 'n1' as DhtAddress
const N2 = 'n2' as DhtAddress
const N3 = 'n3' as DhtAddress
const N4 = 'n4' as DhtAddress
const N5 = 'n5' as DhtAddress

describe(Propagation, () => {
    let getNeighbors: jest.Mock<ReadonlyArray<DhtAddress>, [string]>
    let sendToNeighbor: jest.Mock<Promise<void>, [DhtAddress, StreamMessage]>
    let propagation: Propagation

    beforeEach(() => {
        getNeighbors = jest.fn()
        sendToNeighbor = jest.fn()
        propagation = new Propagation({
            sendToNeighbor,
            minPropagationTargets: 3,
            ttl: TTL,
            maxMessages: 5
        })
    })

    describe('#feedUnseenMessage', () => {
        it('message is propagated to nodes returned by getNeighbors', () => {
            getNeighbors.mockReturnValueOnce([N1, N2, N3])
            const msg = makeMsg('s1', 0, 1000, 1)
            propagation.feedUnseenMessage(msg, [...getNeighbors('s1#0')], null)

            expect(sendToNeighbor).toHaveBeenCalledTimes(3)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(1, N1, msg)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(2, N2, msg)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(3, N3, msg)
        })

        it('message does not get propagated to source node (if present in getNeighbors)', () => {
            getNeighbors.mockReturnValueOnce([N1, N2, N3])
            const msg = makeMsg('s1', 0, 1000, 1)
            propagation.feedUnseenMessage(msg, [...getNeighbors('s1#0')], N2)

            expect(sendToNeighbor).toHaveBeenCalledTimes(2)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(1, N1, msg)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(2, N3, msg)
        })
    })

    describe('#onNeighborJoined', () => {
        let msg: StreamMessage

        async function setUpAndFeed(neighbors: DhtAddress[]): Promise<void> {
            getNeighbors.mockReturnValueOnce(neighbors)
            msg = makeMsg('s1', 0, 1000, 1)
            propagation.feedUnseenMessage(msg, [...getNeighbors('s1#0')], N2)
            await wait(0)
            sendToNeighbor.mockClear()
            getNeighbors.mockClear()
        }

        it('sends to new neighbor', async () => {
            await setUpAndFeed([N1, N2, N3])
            propagation.onNeighborJoined(N4)
            expect(sendToNeighbor).toHaveBeenCalledTimes(1)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(1, N4, msg)
        })

        it('sends to previously failed neighbor', async () => {
            sendToNeighbor.mockImplementation(async (neighbor) => {
                if (neighbor === N3) {
                    throw new Error('failed to send')
                }
            })
            await setUpAndFeed([N1, N2, N3])
            propagation.onNeighborJoined(N3)
            expect(sendToNeighbor).toHaveBeenCalledTimes(1)
            expect(sendToNeighbor).toHaveBeenNthCalledWith(1, N3, msg)
        })

        it('no-op if passed source node', async () => {
            await setUpAndFeed([N1, N2, N3])
            propagation.onNeighborJoined(N2)
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if passed already handled neighbor', async () => {
            await setUpAndFeed([N1, N2, N3])
            propagation.onNeighborJoined(N3)
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if initially `minPropagationTargets` were propagated to', async () => {
            await setUpAndFeed([N1, N2, N3, N4])
            propagation.onNeighborJoined(N5)
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if later `minPropagationTargets` have been propagated to', async () => {
            await setUpAndFeed([N1, N2, N3])
            propagation.onNeighborJoined(N4)
            await wait(0)
            sendToNeighbor.mockClear()
            propagation.onNeighborJoined(N5)
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })

        it('no-op if TTL expires', async () => {
            await setUpAndFeed([N1, N2, N3])
            await wait(200)
            propagation.onNeighborJoined(N3)
            expect(sendToNeighbor).toHaveBeenCalledTimes(0)
        })
    })
})
