import { Stream, StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { fastPrivateKey, fetchPrivateKeyWithGas, generateWalletWithGasAndTokens } from '@streamr/test-utils'
import { StreamPartID, toEthereumAddress, until } from '@streamr/utils'
import { parseEther } from 'ethers'
import { MaintainTopologyHelper } from '../../../../src/plugins/operator/MaintainTopologyHelper'
import { MaintainTopologyService } from '../../../../src/plugins/operator/MaintainTopologyService'
import { OperatorFleetState } from '../../../../src/plugins/operator/OperatorFleetState'
import { StreamPartAssignments } from '../../../../src/plugins/operator/StreamPartAssignments'
import { formCoordinationStreamId } from '../../../../src/plugins/operator/formCoordinationStreamId'
import { createClient, createTestStream } from '../../../utils'

const { delegate, deployOperatorContract, deploySponsorshipContract, stake } = _operatorContractUtils

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
        await client.destroy()
        await operatorFleetState.destroy()
    })

    it(
        'happy path',
        async () => {
            const operatorWallet = await generateWalletWithGasAndTokens()
            const [stream1, stream2] = await setUpStreams()
            const sponsorship1 = await deploySponsorshipContract({ deployer: operatorWallet, streamId: stream1.id })
            const sponsorship2 = await deploySponsorshipContract({ deployer: operatorWallet, streamId: stream2.id })
            const operatorContract = await deployOperatorContract({ deployer: operatorWallet })
            await delegate(operatorWallet, await operatorContract.getAddress(), parseEther('20000'))
            await stake(operatorContract, await sponsorship1.getAddress(), parseEther('10000'))

            const createOperatorFleetState = OperatorFleetState.createOperatorFleetStateBuilder(
                client,
                10 * 1000,
                5 * 60 * 1000,
                30 * 1000,
                2 * 1000,
                0
            )
            const operatorContractAddress = toEthereumAddress(await operatorContract.getAddress())
            operatorFleetState = createOperatorFleetState(formCoordinationStreamId(operatorContractAddress))
            const maintainTopologyHelper = new MaintainTopologyHelper(
                createClient(operatorWallet.privateKey).getOperator(toEthereumAddress(operatorContractAddress))
            )
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

            await until(
                async () => {
                    return containsAll(await getSubscribedStreamPartIds(client), await stream1.getStreamParts())
                },
                10000,
                1000
            )

            await stake(operatorContract, await sponsorship2.getAddress(), parseEther('10000'))
            await until(
                async () => {
                    return containsAll(await getSubscribedStreamPartIds(client), [
                        ...(await stream1.getStreamParts()),
                        ...(await stream2.getStreamParts())
                    ])
                },
                10000,
                1000
            )

            await (await operatorContract.unstake(await sponsorship1.getAddress())).wait()
            await until(
                async () => {
                    const state = await getSubscribedStreamPartIds(client)
                    return (
                        containsAll(state, await stream2.getStreamParts()) &&
                        doesNotContainAny(state, await stream1.getStreamParts())
                    )
                },
                10000,
                1000
            )
        },
        120 * 1000
    )
})
