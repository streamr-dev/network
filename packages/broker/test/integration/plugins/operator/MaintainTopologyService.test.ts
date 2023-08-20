import { parseEther } from '@ethersproject/units'
import { StreamPartID, toStreamID } from '@streamr/protocol'
import { fastPrivateKey, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { toEthereumAddress, waitForCondition } from '@streamr/utils'
import StreamrClient, { Stream } from 'streamr-client'
import {
    setUpAndStartMaintainTopologyService
} from '../../../../src/plugins/operator/MaintainTopologyService'
import { OperatorFleetState } from '../../../../src/plugins/operator/OperatorFleetState'
import { createClient, createTestStream } from '../../../utils'
import {
    THE_GRAPH_URL, deployOperatorContract, deploySponsorshipContract, generateWalletWithGasAndTokens,
    getProvider,
    getTokenContract
} from './contractUtils'

async function setUpStreams(): Promise<[Stream, Stream]> {
    const privateKey = await fetchPrivateKeyWithGas()
    const client = createClient(privateKey)
    const s1 = await createTestStream(client, module, { partitions: 1 })
    const s2 = await createTestStream(client, module, { partitions: 3 })
    await client.destroy()
    return [s1, s2]
}

async function getSubscribedStreamPartIds(client: StreamrClient): Promise<StreamPartID[]> {
    const subscriptions = await client.getSubscriptions()
    return subscriptions.map(({ streamPartId }) => streamPartId)
}

function containsAll(arr: StreamPartID[], includes: StreamPartID[]): boolean {
    for (const item of includes) {
        if (!arr.includes(item)) {
            return false
        }
    }
    return true
}

function doesNotContainAny(arr: StreamPartID[], notToInclude: StreamPartID[]): boolean {
    for (const item of notToInclude) {
        if (arr.includes(item)) {
            return false
        }
    }
    return true
}

describe('MaintainTopologyService', () => {
    let client: StreamrClient
    let operatorFleetState: OperatorFleetState

    beforeEach(() => {
        client = createClient(fastPrivateKey())
    })

    afterEach(async () => {
        await client?.destroy()
    })

    it('happy path', async () => {
        const operatorWallet = await generateWalletWithGasAndTokens()
        const [stream1, stream2] = await setUpStreams()
        const sponsorship1 = await deploySponsorshipContract({ deployer: operatorWallet, streamId: stream1.id })
        const sponsorship2 = await deploySponsorshipContract({ deployer: operatorWallet, streamId: stream2.id })
        const operatorContract = await deployOperatorContract({ deployer: operatorWallet })
        const token = getTokenContract()
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther('200'), operatorWallet.address)).wait()
        await (await operatorContract.stake(sponsorship1.address, parseEther('100'))).wait()

        const serviceHelperConfig = {
            provider: getProvider(),
            signer: operatorWallet,
            operatorContractAddress: toEthereumAddress(operatorContract.address),
            theGraphUrl: THE_GRAPH_URL
        }

        operatorFleetState = new OperatorFleetState(client, toStreamID('/operator/coordination', serviceHelperConfig.operatorContractAddress))
        await setUpAndStartMaintainTopologyService({
            streamrClient: client,
            replicationFactor: 3,
            serviceHelperConfig,
            operatorFleetState
        })

        await waitForCondition(async () => {
            return containsAll(await getSubscribedStreamPartIds(client), stream1.getStreamParts())
        }, 10000, 1000)

        await (await operatorContract.stake(sponsorship2.address, parseEther('100'))).wait()
        await waitForCondition(async () => {
            return containsAll(await getSubscribedStreamPartIds(client), [
                ...stream1.getStreamParts(),
                ...stream2.getStreamParts()
            ])
        }, 10000, 1000)

        await (await operatorContract.unstake(sponsorship1.address)).wait()
        await waitForCondition(async () => {
            const state = await getSubscribedStreamPartIds(client)
            return containsAll(state, stream2.getStreamParts()) && doesNotContainAny(state, stream1.getStreamParts())
        }, 10000, 1000)
    }, 120 * 1000)
})
