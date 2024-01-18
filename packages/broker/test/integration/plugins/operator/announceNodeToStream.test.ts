import { fastPrivateKey } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import { announceNodeToStream } from '../../../../src/plugins/operator/announceNodeToStream'
import { createClient } from '../../../utils'
import { setupOperatorContract } from './contractUtils'
import { formCoordinationStreamId } from '../../../../src/plugins/operator/formCoordinationStreamId'

const TIMEOUT = 20 * 1000

// TODO add Jest utility so that the normalization is not needed (NET-1254)
const normalizeBinaryBuffer = (buffer: Buffer) => {
    return new Uint8Array(buffer)
}

describe('announceNodeToStream', () => {

    it('publishes to stream', async () => {
        const { operatorServiceConfig, nodeWallets } = await setupOperatorContract({
            nodeCount: 1
        })
        const operatorContractAddress = operatorServiceConfig.operatorContractAddress
        const nodeWallet = nodeWallets[0]
        const client = createClient(nodeWallet.privateKey)
        const streamId = formCoordinationStreamId(operatorContractAddress)
        const anonymousClient = createClient(fastPrivateKey())
        const subscription = await anonymousClient.subscribe(streamId)

        await announceNodeToStream(operatorContractAddress, client)

        const [{ content }] = await collect(subscription, 1)
        const localPeerDescriptor = (await client.getPeerDescriptor()) as any
        expect(content).toEqual({
            msgType: 'heartbeat',
            peerDescriptor: {
                ...localPeerDescriptor,
                publicKey: normalizeBinaryBuffer(localPeerDescriptor.publicKey),
                signature: normalizeBinaryBuffer(localPeerDescriptor.signature),
            }
        })

        await anonymousClient.destroy()
        await client.destroy()
    }, TIMEOUT)
})
