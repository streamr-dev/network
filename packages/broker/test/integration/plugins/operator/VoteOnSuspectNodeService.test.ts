import { config as CHAIN_CONFIG } from '@streamr/config'
import { StreamrEnvDeployer, TestToken } from '@streamr/network-contracts'
import { toEthereumAddress, waitForCondition } from '@streamr/utils'
import { Wallet } from 'ethers'
import { VoteOnSuspectNodeHelper } from '../../../../src/plugins/operator/VoteOnSuspectNodeHelper'
import { VoteOnSuspectNodeService } from '../../../../src/plugins/operator/VoteOnSuspectNodeService'
import { createClient, createTestStream } from '../../../utils'
import { delegate,
    deploySponsorshipContract,
    generateWalletWithGasAndTokens,
    getProvider,
    setupOperatorContract,
    sponsor,
    stake
} from './contractUtils'
import { toStreamID } from '@streamr/protocol'
import { OperatorFleetState } from '../../../../src/plugins/operator/OperatorFleetState'

const TIMEOUT = 1000 * 60 * 10
const ADMIN_PRIV_KEY = CHAIN_CONFIG.dev2.adminPrivateKey
const CHAIN_URL = CHAIN_CONFIG.dev2.rpcEndpoints[0].url

describe('VoteOnSuspectNodeService', () => {

    let adminWallet: Wallet
    let token: TestToken
    let streamId: string
    let chainConfig: any

    beforeAll(async () => {
        const streamrEnvDeployer = new StreamrEnvDeployer(ADMIN_PRIV_KEY, CHAIN_URL)
        await streamrEnvDeployer.deployEnvironment()
        const { contracts } = streamrEnvDeployer
        chainConfig = { contracts: streamrEnvDeployer.addresses } as any
        adminWallet = new Wallet(ADMIN_PRIV_KEY, getProvider())
        token = contracts.DATA as unknown as TestToken
        const client = createClient(ADMIN_PRIV_KEY, {
            contracts: {
                streamRegistryChainAddress: chainConfig.contracts.StreamRegistry,
                streamRegistryChainRPCs: {
                    chainId: 0,  // some chain id
                    rpcs: [{
                        url: CHAIN_URL
                    }]
                }
            }
        })
        streamId = (await createTestStream(client, module)).id
        await createTestStream(client, module)
        await client.destroy()

    }, TIMEOUT)

    it('votes on suspected node when review requested', async () => {
        const flagger = await setupOperatorContract({ nodeCount: 1, adminKey: ADMIN_PRIV_KEY, chainConfig })
        const target = await setupOperatorContract({ adminKey: ADMIN_PRIV_KEY, chainConfig })
        const voter = await setupOperatorContract({ nodeCount: 1, adminKey: ADMIN_PRIV_KEY, chainConfig })
        const sponsorer = await generateWalletWithGasAndTokens({ adminKey: ADMIN_PRIV_KEY, chainConfig })
        const sponsorship = await deploySponsorshipContract({ streamId, deployer: adminWallet, chainConfig })

        await sponsor(sponsorer, sponsorship.address, 500, token)
        for (const actor of [flagger, target, voter]) {
            await delegate(actor.operatorWallet, actor.operatorContract.address, 200, token)
            await stake(actor.operatorContract, sponsorship.address, 150)
        }

        const voterClient = createClient(voter.nodeWallets[0].privateKey, {
            contracts: {
                streamRegistryChainAddress: chainConfig.contracts.StreamRegistry,
                streamRegistryChainRPCs: {
                    chainId: 0,  // some chain id
                    rpcs: [{
                        url: CHAIN_URL
                    }]
                }
            }
        })
        const coordinationStreamId = toStreamID('/operator/coordination', toEthereumAddress(voter.operatorContract.address))
        const operatorFleetState = new OperatorFleetState(
            voterClient,
            coordinationStreamId,
            undefined,
            undefined,
            undefined,
            1000,
            100
        )
        await operatorFleetState.start()
        await voterClient.publish(coordinationStreamId, {
            msgType: 'heartbeat',
            peerDescriptor: await voterClient.getPeerDescriptor()
        })
        const helper = new VoteOnSuspectNodeHelper({
            ...voter.operatorServiceConfig,
            nodeWallet: voter.nodeWallets[0]
        })
        const voterVoteService = new VoteOnSuspectNodeService(
            helper,
            voterClient,
            operatorFleetState
        )
        await voterVoteService.start()

        const voteOnFlag = jest.spyOn(helper, 'voteOnFlag')

        await (await flagger.operatorContract.connect(flagger.nodeWallets[0]).flag(sponsorship.address, target.operatorContract.address)).wait()
        // check that voter votes
        await waitForCondition(() => voteOnFlag.mock.calls.length > 0, 10000)
        expect(voteOnFlag).toHaveBeenCalledTimes(1)
        expect(voteOnFlag).toHaveBeenCalledWith(sponsorship.address, target.operatorContract.address, true)
        voterVoteService.stop()
    }, TIMEOUT)
})
