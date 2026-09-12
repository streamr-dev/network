import { StreamPartIDUtils } from '@streamr/utils'
import { toNodeId } from '@streamr/dht'
import { NeighborInfo } from '../../src/types'
import { EventEmitter } from 'eventemitter3'
import { NetworkNode } from '../../src/NetworkNode'
import { NetworkStack } from '../../src/NetworkStack'
import { Events } from '../../src/ContentDeliveryManager'
import { StreamMessage } from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { randomUserId } from '@streamr/test-utils'

const STREAM_PART = StreamPartIDUtils.parse('stream#0')
const PUBLISHER_ID = randomUserId()

const createMessage = (id: number): StreamMessage => {
    return createStreamMessage(`${id}`, STREAM_PART, PUBLISHER_ID)
}

describe('NetworkNode', () => {

    it('message listener', async () => {
        const contentDeliveryManager = new EventEmitter<Events>()
        const stack: Partial<NetworkStack> = {
            getContentDeliveryManager: () => contentDeliveryManager as any,
            joinStreamPart: async () => {}
        }
        const node = new NetworkNode(stack as any)
        await node.join(STREAM_PART)
        const onMessage = jest.fn()

        node.addMessageListener(onMessage)
        const msg1 = createMessage(1)
        const msg2 = createMessage(2)
        contentDeliveryManager.emit('newMessage', msg1)
        contentDeliveryManager.emit('newMessage', msg2)
        expect(onMessage.mock.calls[0][0]).toEqual(msg1)
        expect(onMessage.mock.calls[1][0]).toEqual(msg2)
        expect(onMessage).toHaveBeenCalledTimes(2)

        node.removeMessageListener(onMessage)
        contentDeliveryManager.emit('newMessage', createMessage(3))
        expect(onMessage).toHaveBeenCalledTimes(2)
    })

    it('neighbor statistics and neighbor list listeners', () => {
        const peerDescriptor = createMockPeerDescriptor()
        const info: NeighborInfo = { nodeId: toNodeId(peerDescriptor), peerDescriptor, rtt: 5 }
        const contentDeliveryManager = Object.assign(new EventEmitter<Events>(), {
            getNeighborInfos: jest.fn(() => [info])
        })
        const stack: Partial<NetworkStack> = {
            getContentDeliveryManager: () => contentDeliveryManager as any
        }
        const node = new NetworkNode(stack as any)

        const onStatistics = jest.fn()
        node.addNeighborStatisticsListener(onStatistics)
        contentDeliveryManager.emit('neighborStatisticsUpdated', STREAM_PART, info)
        expect(onStatistics).toHaveBeenCalledWith(STREAM_PART, info)
        node.removeNeighborStatisticsListener(onStatistics)
        contentDeliveryManager.emit('neighborStatisticsUpdated', STREAM_PART, info)
        expect(onStatistics).toHaveBeenCalledTimes(1)

        const onList = jest.fn()
        node.addNeighborListUpdatedListener(onList)
        contentDeliveryManager.emit('neighborListUpdated', STREAM_PART, [info])
        expect(onList).toHaveBeenCalledWith(STREAM_PART, [info])
        node.removeNeighborListUpdatedListener(onList)
        contentDeliveryManager.emit('neighborListUpdated', STREAM_PART, [])
        expect(onList).toHaveBeenCalledTimes(1)

        expect(node.getNeighborInfos(STREAM_PART)).toEqual([info])
        expect(contentDeliveryManager.getNeighborInfos).toHaveBeenCalledWith(STREAM_PART)
    })
})
