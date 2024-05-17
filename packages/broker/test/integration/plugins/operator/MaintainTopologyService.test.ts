import { StreamPartID } from '@streamr/protocol'
import { fastPrivateKey, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { toEthereumAddress, waitForCondition } from '@streamr/utils'
import { Stream, StreamrClient } from '@streamr/sdk'
import { OperatorFleetState } from '../../../../src/plugins/operator/OperatorFleetState'
import { createClient, createTestStream } from '../../../utils'
import {
    TEST_CHAIN_CONFIG,
    delegate,
    deployOperatorContract,
    deploySponsorshipContract,
    generateWalletWithGasAndTokens,
    stake
} from './contractUtils'
import { formCoordinationStreamId } from '../../../../src/plugins/operator/formCoordinationStreamId'
import { StreamPartAssignments } from '../../../../src/plugins/operator/StreamPartAssignments'
import { MaintainTopologyHelper } from '../../../../src/plugins/operator/MaintainTopologyHelper'
import { MaintainTopologyService } from '../../../../src/plugins/operator/MaintainTopologyService'
import { ContractFacade } from '../../../../src/plugins/operator/ContractFacade'

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
        await operatorFleetState?.destroy()
    })

    it('happy path', async () => {
        const operatorWallet = await generateWalletWithGasAndTokens()
        const [stream1, stream2] = await setUpStreams()
        const sponsorship1 = await deploySponsorshipContract({ deployer: operatorWallet, streamId: stream1.id })
        const sponsorship2 = await deploySponsorshipContract({ deployer: operatorWallet, streamId: stream2.id })
        const operatorContract = await deployOperatorContract({ deployer: operatorWallet })
        await delegate(operatorWallet, operatorContract.address, 20000)
        await stake(operatorContract, sponsorship1.address, 10000)

        const serviceHelperConfig = {
            signer: operatorWallet,
            operatorContractAddress: toEthereumAddress(operatorContract.address),
            theGraphUrl: TEST_CHAIN_CONFIG.theGraphUrl,
            getEthersOverrides: () => ({})
        }

        const createOperatorFleetState = OperatorFleetState.createOperatorFleetStateBuilder(
            client,
            10 * 1000,
            5 * 60 * 1000,
            30 * 1000,
            2 * 1000,
            0
        )
        const operatorFleetState = createOperatorFleetState(formCoordinationStreamId(serviceHelperConfig.operatorContractAddress))
        const maintainTopologyHelper = new MaintainTopologyHelper(ContractFacade.createInstance(serviceHelperConfig))
        const assignments = new StreamPartAssignments(
            await client.getNodeId(),
            3,
            async (streamId) => {
                const stream = await client.getStream(streamId)
                return stream.getStreamParts()
            },
            operatorFleetState,
            maintainTopologyHelper
        )
        new MaintainTopologyService(client, assignments)
        await operatorFleetState.start()
        await maintainTopologyHelper.start()

        await waitForCondition(async () => {
            return containsAll(await getSubscribedStreamPartIds(client), stream1.getStreamParts())
        }, 20000, 1000)

        await stake(operatorContract, sponsorship2.address, 10000)
        await waitForCondition(async () => {
            return containsAll(await getSubscribedStreamPartIds(client), [
                ...stream1.getStreamParts(),
                ...stream2.getStreamParts()
            ])
        }, 20000, 1000)

        await (await operatorContract.unstake(sponsorship1.address)).wait()
        await waitForCondition(async () => {
            const state = await getSubscribedStreamPartIds(client)
            return containsAll(state, stream2.getStreamParts()) && doesNotContainAny(state, stream1.getStreamParts())
        }, 20000, 1000)
    }, 120 * 1000)
})
