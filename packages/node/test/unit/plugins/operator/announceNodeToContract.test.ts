import { DhtAddress } from '@streamr/dht'
import { NetworkNodeType, Operator, StreamrClient } from '@streamr/sdk'
import { MockProxy, mock } from 'jest-mock-extended'
import { announceNodeToContract } from '../../../../src/plugins/operator/announceNodeToContract'

const NODE_ID = '0x1111' as DhtAddress

const createOperator = (timestampOfLastHeartbeat: number | undefined): MockProxy<Operator> => {
    const operator = mock<Operator>()
    operator.getTimestampOfLastHeartbeat.mockImplementation(async () => {
        return timestampOfLastHeartbeat
    })
    operator.writeHeartbeat.mockResolvedValue(undefined)
    return operator
}

describe('announceNodeToContract', () => {
    let streamrClient: MockProxy<StreamrClient>

    beforeAll(() => {
        streamrClient = mock<StreamrClient>()
        streamrClient.getPeerDescriptor.mockResolvedValue({ nodeId: NODE_ID, type: NetworkNodeType.NODEJS })
    })

    it('writes heartbeat immediately if undefined at start', async () => {
        const operator = createOperator(undefined)
        await announceNodeToContract(500, operator, streamrClient)
        expect(operator.writeHeartbeat).toHaveBeenCalledWith({ nodeId: NODE_ID, type: NetworkNodeType.NODEJS })
    })

    it('writes heartbeat immediately if already stale at start', async () => {
        const operator = createOperator(Date.now() - 600)
        await announceNodeToContract(500, operator, streamrClient)
        expect(operator.writeHeartbeat).toHaveBeenCalledWith({ nodeId: NODE_ID, type: NetworkNodeType.NODEJS })
    })

    it('does not write heartbeat immediately if not stale at start', async () => {
        const operator = createOperator(Date.now())
        await announceNodeToContract(500, operator, streamrClient)
        expect(operator.writeHeartbeat).not.toHaveBeenCalled()
    })
})
