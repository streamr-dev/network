import { setupOperatorContract } from './contractUtils'
import { AnnounceNodeToStreamService } from '../../../../src/plugins/operator/AnnounceNodeToStreamService'
import { createClient } from '../../../utils'
import { StreamrClient } from 'streamr-client'
import { fastPrivateKey } from '@streamr/test-utils'
import { toStreamID } from '@streamr/protocol'
import { collect, EthereumAddress } from '@streamr/utils'

const TIMEOUT = 10 * 1000

describe(AnnounceNodeToStreamService, () => {
    let operatorContractAddress: EthereumAddress
    let client: StreamrClient
    let service: AnnounceNodeToStreamService

    beforeEach(async () => {
        const { operatorServiceConfig, nodeWallets } = await setupOperatorContract({
            nodeCount: 1
        })
        operatorContractAddress = operatorServiceConfig.operatorContractAddress
        const nodeWallet = nodeWallets[0]
        client = createClient(nodeWallet.privateKey)
        service = new AnnounceNodeToStreamService(client, operatorContractAddress, 250)
        await service.start()
    }, TIMEOUT)

    afterEach(async () => {
        await service?.stop()
        await client?.destroy()
    }, TIMEOUT)

    it('publishes to stream', async () => {
        const streamId = toStreamID('/operator/coordination', operatorContractAddress)
        const anonymousClient = createClient(fastPrivateKey())
        const subscription = await anonymousClient.subscribe(streamId)
        const [{ content }] = await collect(subscription, 1)
        expect(content).toEqual({
            msgType: 'heartbeat',
            peerDescriptor: await client.getPeerDescriptor()
        })
        await anonymousClient.destroy()
    }, TIMEOUT)
})
