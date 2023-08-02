import {
    setUpAndStartMaintainTopologyService
} from '../../../../src/plugins/operator/MaintainTopologyService'
import { toEthereumAddress, waitForCondition } from '@streamr/utils'
import { fastPrivateKey, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { parseEther } from '@ethersproject/units'
import StreamrClient, { Stream } from 'streamr-client'
import {
    deploySponsorship,
    deployOperatorContract,
    generateWalletWithGasAndTokens,
    getProvider,
    getTokenContract
} from './smartContractUtils'
import { StreamPartID, toStreamID } from '@streamr/protocol'
import { createClient } from '../../../utils'
import { OperatorFleetState } from '../../../../src/plugins/operator/OperatorFleetState'

async function setUpStreams(): Promise<[Stream, Stream]> {
    const privateKey = await fetchPrivateKeyWithGas()
    const client = createClient(privateKey)
    const s1 = await client.createStream({ id: '/test1/' + Date.now(), partitions: 1 })
    const s2 = await client.createStream({ id: '/test2/' + Date.now(), partitions: 3 })
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

    afterEach(async () => {
        await client?.destroy()
    })

    it('happy path', async () => {
        const provider = getProvider()
        const operatorWallet = await generateWalletWithGasAndTokens(provider)
        const [stream1, stream2] = await setUpStreams()
        const sponsorship1 = await deploySponsorship(stream1.id, operatorWallet)
        const sponsorship2 = await deploySponsorship(stream2.id, operatorWallet)
        const operatorContract = await deployOperatorContract(operatorWallet)
        const token = getTokenContract()
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther("200"), operatorWallet.address)).wait()
        await (await operatorContract.stake(sponsorship1.address, parseEther("100"))).wait()

        const serviceHelperConfig = {
            provider,
            signer: operatorWallet,
            operatorContractAddress: toEthereumAddress(operatorContract.address),
            theGraphUrl: `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`,
        }

        client = createClient(fastPrivateKey())
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

        await (await operatorContract.stake(sponsorship2.address, parseEther("100"))).wait()
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
