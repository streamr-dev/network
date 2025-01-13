import { ListeningRpcCommunicator, toDhtAddress } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/utils'
import { TemporaryConnectionRpcLocal } from '../../src/logic/temporary-connection/TemporaryConnectionRpcLocal'
import { MockTransport } from '../utils/mock/MockTransport'
import { createMockPeerDescriptor } from '../utils/utils'

describe('TemporaryConnectionRpcLocal', () => {
    const peerDescriptor = createMockPeerDescriptor()
    let rpcCommunicator: ListeningRpcCommunicator
    let rpcLocal: TemporaryConnectionRpcLocal

    beforeEach(() => {
        rpcCommunicator = new ListeningRpcCommunicator('mock', new MockTransport())
        rpcLocal = new TemporaryConnectionRpcLocal({
            localPeerDescriptor: peerDescriptor,
            rpcCommunicator,
            streamPartId: StreamPartIDUtils.parse('mock#0'),
            connectionLocker: {
                weakLockConnection: jest.fn(),
                weakUnlockConnection: jest.fn()
            } as any
        })
    })

    afterEach(() => {
        rpcCommunicator.destroy()
    })

    it('Open and Close Connection', async () => {
        const caller = createMockPeerDescriptor()
        await rpcLocal.openConnection({}, { incomingSourceDescriptor: caller } as any)
        expect(rpcLocal.getNodes().get(toDhtAddress(caller.nodeId))).toBeDefined()
        await rpcLocal.closeConnection({}, { incomingSourceDescriptor: caller } as any)
        expect(rpcLocal.getNodes().get(toDhtAddress(caller.nodeId))).toBeUndefined()
    })
})
