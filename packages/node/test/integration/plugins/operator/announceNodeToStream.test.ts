import { setupTestOperatorContract } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import { version as applicationVersion } from '../../../../package.json'
import { announceNodeToStream } from '../../../../src/plugins/operator/announceNodeToStream'
import { formCoordinationStreamId } from '../../../../src/plugins/operator/formCoordinationStreamId'
import { createClient, deployTestOperatorContract } from '../../../utils'

const TIMEOUT = 40 * 1000

describe('announceNodeToStream', () => {

    it('publishes to stream', async () => {
        const { operatorContractAddress, nodeWallets } = await setupTestOperatorContract({
            nodeCount: 1,
            deployTestOperatorContract
        })
        const nodeWallet = nodeWallets[0]
        const client = createClient(nodeWallet.privateKey)
        const streamId = formCoordinationStreamId(operatorContractAddress)
        const anonymousClient = createClient()
        const subscription = await anonymousClient.subscribe(streamId)

        await announceNodeToStream(operatorContractAddress, client)

        const [{ content }] = await collect(subscription, 1)
        expect(content).toEqual({
            msgType: 'heartbeat',
            peerDescriptor: await client.getPeerDescriptor(),
            applicationVersion
        })

        await anonymousClient.destroy()
        await client.destroy()
    }, TIMEOUT)
})
