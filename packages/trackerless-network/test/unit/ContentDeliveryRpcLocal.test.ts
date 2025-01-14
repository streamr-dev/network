import { ListeningRpcCommunicator } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/utils'
import { ContentDeliveryRpcLocal } from '../../src/logic/ContentDeliveryRpcLocal'
import { LeaveStreamPartNotice } from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { MockTransport } from '../utils/mock/MockTransport'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { randomUserId } from '@streamr/test-utils'

describe('ContentDeliveryRpcLocal', () => {
    let rpcLocal: ContentDeliveryRpcLocal
    const peerDescriptor = createMockPeerDescriptor()

    const mockSender = createMockPeerDescriptor()

    const message = createStreamMessage(
        JSON.stringify({ hello: 'WORLD' }),
        StreamPartIDUtils.parse('random-graph#0'),
        randomUserId()
    )

    let mockBroadcast: jest.Mock
    let mockDuplicateCheck: jest.Mock
    let mockOnLeaveNotice: jest.Mock
    let mockMarkForInspection: jest.Mock

    beforeEach(async () => {
        mockDuplicateCheck = jest.fn((_c, _p) => true)
        mockBroadcast = jest.fn((_m, _p) => {})
        mockOnLeaveNotice = jest.fn((_m) => {})
        mockMarkForInspection = jest.fn((_m) => {})

        rpcLocal = new ContentDeliveryRpcLocal({
            markAndCheckDuplicate: mockDuplicateCheck,
            broadcast: mockBroadcast,
            onLeaveNotice: mockOnLeaveNotice,
            markForInspection: mockMarkForInspection,
            localPeerDescriptor: peerDescriptor,
            streamPartId: StreamPartIDUtils.parse('stream#0'),
            rpcCommunicator: new ListeningRpcCommunicator('random-graph-node', new MockTransport())
        })
    })

    it('Server sendStreamMessage()', async () => {
        await rpcLocal.sendStreamMessage(message, { incomingSourceDescriptor: mockSender } as any)
        expect(mockDuplicateCheck).toHaveBeenCalledTimes(1)
        expect(mockBroadcast).toHaveBeenCalledTimes(1)
        expect(mockMarkForInspection).toHaveBeenCalledTimes(1)
    })

    it('Server leaveStreamPartNotice()', async () => {
        const leaveNotice: LeaveStreamPartNotice = {
            streamPartId: StreamPartIDUtils.parse('stream#0'),
            isEntryPoint: false
        }
        await rpcLocal.leaveStreamPartNotice(leaveNotice, { incomingSourceDescriptor: mockSender } as any)
        expect(mockOnLeaveNotice).toHaveBeenCalledTimes(1)
    })
})
