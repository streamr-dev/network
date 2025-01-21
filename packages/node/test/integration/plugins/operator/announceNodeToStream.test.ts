import { _operatorContractUtils } from '@streamr/sdk'
import { fastPrivateKey, generateWalletWithGasAndTokens } from '@streamr/test-utils'
import { collect, toEthereumAddress } from '@streamr/utils'
import { version as applicationVersion } from '../../../../package.json'
import { announceNodeToStream } from '../../../../src/plugins/operator/announceNodeToStream'
import { formCoordinationStreamId } from '../../../../src/plugins/operator/formCoordinationStreamId'
import { createClient } from '../../../utils'

const TIMEOUT = 40 * 1000

describe('announceNodeToStream', () => {

    it('publishes to stream', async () => {
        const { operatorContract, nodeWallets } = await _operatorContractUtils.setupOperatorContract({
            nodeCount: 1,
            generateWalletWithGasAndTokens
        })
        const operatorContractAddress = toEthereumAddress(await operatorContract.getAddress())
        const nodeWallet = nodeWallets[0]
        const client = createClient(nodeWallet.privateKey)
        const streamId = formCoordinationStreamId(operatorContractAddress)
        const anonymousClient = createClient(fastPrivateKey())
        const subscription = await anonymousClient.subscribe(streamId)

        await announceNodeToStream(operatorContractAddress, client)

        const [{ content }] = await collect(subscription, 1)
        expect(content).toEqual({
            msgType: 'heartbeat',
            peerDescriptor: await client.getPeerDescriptor(),
            version: applicationVersion
        })

        await anonymousClient.destroy()
        await client.destroy()
    }, TIMEOUT)
})
