import { AnnounceNodeToStreamService } from '../../../../src/plugins/operator/AnnounceNodeToStreamService'
import { NetworkNodeType, StreamrClient } from 'streamr-client'
import { mock, mockClear, MockProxy } from 'jest-mock-extended'
import { toEthereumAddress, wait } from '@streamr/utils'
import { toStreamID } from '@streamr/protocol'

const INTERVAL_IN_MS = 25
const ADDRESS = toEthereumAddress('0x61BBf708Fb7bB1D4dA10D1958C88A170988d3d1F')
const PEER_DESCRIPTOR = Object.freeze({
    id: 'nodeId',
    type: NetworkNodeType.NODEJS,
    websocket: {
        ip: '127.0.0.1',
        port: 6666
    },
    openInternet: true
})

describe(AnnounceNodeToStreamService, () => {

    let streamrClient: MockProxy<StreamrClient>
    let service: AnnounceNodeToStreamService

    beforeEach(async () => {
        streamrClient = mock<StreamrClient>()
        streamrClient.getPeerDescriptor.mockResolvedValue(PEER_DESCRIPTOR)
        streamrClient.publish.mockResolvedValue(null as any)
        service = new AnnounceNodeToStreamService(streamrClient, ADDRESS, INTERVAL_IN_MS)
        await service.start()
    })

    afterEach(async () => {
        await service?.stop()
    })

    it('publishes a heartbeat every 10 seconds', async () => {
        await wait(INTERVAL_IN_MS * 12)
        expect(streamrClient.publish.mock.calls.length).toBeGreaterThan(10)
        expect(streamrClient.publish).toHaveBeenCalledWith(toStreamID('/operator/coordination', ADDRESS), {
            msgType: 'heartbeat',
            peerDescriptor: PEER_DESCRIPTOR
        })
    })

    it('stops publishing heartbeats when stopped', async () => {
        await wait(INTERVAL_IN_MS * 4)
        mockClear(streamrClient)
        await service.stop()
        await wait(INTERVAL_IN_MS * 4)
        expect(streamrClient.publish).not.toHaveBeenCalled()
    })
})
