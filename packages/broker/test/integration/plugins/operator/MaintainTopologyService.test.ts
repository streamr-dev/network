import { MaintainTopologyService } from '../../../../src/plugins/operator/MaintainTopologyService'
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
import { StreamPartID } from '@streamr/protocol'
import { MaintainTopologyHelper } from '../../../../src/plugins/operator/MaintainTopologyHelper'
import { createClient } from '../../../utils'

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

describe('MaintainTopologyService', () => {
    let service: MaintainTopologyService
    let client: StreamrClient

    afterEach(async () => {
        await service.stop()
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

        const serviceConfig = {
            provider,
            signer: operatorWallet,
            operatorContractAddress: toEthereumAddress(operatorContract.address),
            theGraphUrl: `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`,
        }

        client = createClient(fastPrivateKey())
        service = new MaintainTopologyService(client, new MaintainTopologyHelper(
            serviceConfig
        ))
        await service.start()

        await waitForCondition(async () => (await client.getSubscriptions()).length === 1, 10000, 1000)
        expect(await getSubscribedStreamPartIds(client)).toEqual(stream1.getStreamParts())

        await (await operatorContract.stake(sponsorship2.address, parseEther("100"))).wait()
        await waitForCondition(async () => (await client.getSubscriptions()).length === 1 + 3)
        expect(await getSubscribedStreamPartIds(client)).toEqual([
            ...stream1.getStreamParts(),
            ...stream2.getStreamParts()
        ])

        await (await operatorContract.unstake(sponsorship1.address)).wait()
        await waitForCondition(async () => (await client.getSubscriptions()).length === 3)
        expect(await getSubscribedStreamPartIds(client)).toEqual(stream2.getStreamParts())
    }, 120 * 1000)
})
