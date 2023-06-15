import { MaintainTopologyService } from '../../../../src/plugins/operator/MaintainTopologyService'
import fetch from 'node-fetch'
import { Logger, waitForCondition } from '@streamr/utils'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { parseEther } from '@ethersproject/units'
import StreamrClient, { CONFIG_TEST, Stream } from 'streamr-client'
import {
    deploySponsorship,
    deployOperatorContract,
    generateWalletWithGasAndTokens,
    getProvider,
    getTokenContract
} from './smartContractUtils'
import { StreamPartID } from '@streamr/protocol'
import { MaintainTopologyHelper } from '../../../../src/plugins/operator/MaintainTopologyHelper'

const log = (new Logger(module)).info

async function setUpStreams(): Promise<[Stream, Stream]> {
    const privateKey = await fetchPrivateKeyWithGas()
    const client = new StreamrClient({
        auth: {
            privateKey
        },
        ...CONFIG_TEST
    })
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

    it("allows to flag an operator as malicious", async () => {
        const flagger = await deployNewOperator()
        log("deployed flagger contract" + flagger.operatorConfig.operatorContractAddress)
        const target = await deployNewOperator()
        log("deployed target contract" + target.operatorConfig.operatorContractAddress)
        const voter = await deployNewOperator()
        log("deployed voter contract" + voter.operatorConfig.operatorContractAddress)

        await new Promise((resolve) => setTimeout(resolve, 5000)) // wait for events to be processed
        const flaggerOperatorClient = new OperatorClient(flagger.operatorConfig, logger)
        await flaggerOperatorClient.start()

        const targetOperatorClient = new OperatorClient(target.operatorConfig, logger)
        await targetOperatorClient.start()

        const voterOperatorClient = new OperatorClient(voter.operatorConfig, logger)
        await voterOperatorClient.start()
    
        let receivedReviewRequested = false
        voterOperatorClient.on("onReviewRequest", (targetOperator: string, sponsorship: string) => {
            log(`got onRviewRequested event for targetOperator ${targetOperator} with sponsorship ${sponsorship}`)
            receivedReviewRequested = true
        })

        log("deploying sponsorship contract")
        const sponsorship = await deploySponsorship(config, adminWallet , {
            streamId: streamId1 })
        log("sponsoring sponsorship contract")
        await (await token.connect(adminWallet).approve(sponsorship.address, parseEther("500"))).wait()
        await (await sponsorship.sponsor(parseEther("500"))).wait()

        voter.operatorContract.on("ReviewRequest", (targetOperator: string, sponsorship: string) => {
            log(`IN TEST got ReviewRequest event for targetOperator ${targetOperator} with sponsorship ${sponsorship}`)
            receivedReviewRequested = true
        })

        flagger.operatorContract.on("ReviewRequest", (targetOperator: string, sponsorship: string) => {
            log(`IN TEST got ReviewRequest event for targetOperator ${targetOperator} with sponsorship ${sponsorship}`)
            receivedReviewRequested = true
        })

        log("each operator delegates to its operactor contract")
        log("delegating from flagger: ", flagger.operatorWallet.address)
        await (await token.connect(flagger.operatorWallet).transferAndCall(flagger.operatorContract.address,
            parseEther("200"), flagger.operatorWallet.address)).wait()
        log("delegating from target: ", target.operatorWallet.address)
        await (await token.connect(target.operatorWallet).transferAndCall(target.operatorContract.address,
            parseEther("200"), target.operatorWallet.address)).wait()
        log("delegating from voter: ", voter.operatorWallet.address)
        await (await token.connect(voter.operatorWallet).transferAndCall(voter.operatorContract.address,
            parseEther("200"), voter.operatorWallet.address)).wait()
        
        await new Promise((resolve) => setTimeout(resolve, 5000))

        log("staking to sponsorship contract from flagger and target and voter")
        log("staking from flagger: ", flagger.operatorContract.address)
        await (await flagger.operatorContract.stake(sponsorship.address, parseEther("150"))).wait()
        log("staking from target: ", target.operatorContract.address)
        await new Promise((resolve) => setTimeout(resolve, 3000))
        await (await target.operatorContract.stake(sponsorship.address, parseEther("150"))).wait()
        log("staking from voter: ", voter.operatorContract.address)
        await new Promise((resolve) => setTimeout(resolve, 3000))
        await (await voter.operatorContract.stake(sponsorship.address, parseEther("150"))).wait()
        await new Promise((resolve) => setTimeout(resolve, 3000))
        
        log("registering node addresses")
        // await (await flagger.operatorContract.setNodeAddresses([await flagger.operatorContract.owner()])).wait()
        const nodesettr = await (await flagger.operatorContract.setNodeAddresses([flagger.operatorWallet.address])).wait()

        log("flagging target operator")
        // flaggerOC -> sponsorshipC -> voterOC.emits
        const tr = await (await flagger.operatorContract.flag(sponsorship.address, target.operatorContract.address)).wait()
        await waitForCondition(() => receivedReviewRequested, 100000, 1000)
        
        flaggerOperatorClient.stop()
    })
})
