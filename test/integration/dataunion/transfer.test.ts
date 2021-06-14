import { BigNumber, Contract, providers, Wallet } from 'ethers'
import { parseEther } from 'ethers/lib/utils'
import debug from 'debug'
import * as Token from '../../../contracts/TestToken.json'
import { clientOptions, tokenAdminPrivateKey, tokenMediatorAddress, relayTokensAbi } from '../config'
import { getEndpointUrl, until } from '../../../src/utils'
import { MemberStatus } from '../../../src/dataunion/DataUnion'
import { StreamrClient } from '../../../src/StreamrClient'
import { EthereumAddress } from '../../../src/types'
import authFetch from '../../../src/rest/authFetch'

const log = debug('StreamrClient::DataUnion::integration-test-transfer')

const providerSidechain = new providers.JsonRpcProvider(clientOptions.sidechain)
const providerMainnet = new providers.JsonRpcProvider(clientOptions.mainnet)

const tokenAdminWallet = new Wallet(tokenAdminPrivateKey, providerMainnet)
const tokenMainnet = new Contract(clientOptions.tokenAddress, Token.abi, tokenAdminWallet)

const adminWalletSidechain = new Wallet(clientOptions.auth.privateKey, providerSidechain)
const tokenSidechain = new Contract(clientOptions.tokenSidechainAddress, Token.abi, adminWalletSidechain)

const sendTokensToSidechain = async (receiverAddress: EthereumAddress, amount: BigNumber) => {
    const tokenMediator = new Contract(tokenMediatorAddress, relayTokensAbi, tokenAdminWallet)
    const tx1 = await tokenMainnet.approve(tokenMediator.address, amount)
    await tx1.wait()
    log('Approved')
    const tx2 = await tokenMediator.relayTokensAndCall(tokenMainnet.address, receiverAddress, amount, '0x1234') // dummy 0x1234
    await tx2.wait()
    log('Relayed tokens')
    await until(async () => !(await tokenSidechain.balanceOf(receiverAddress)).eq('0'), 300000, 3000)
    log('Sidechain balance changed')
}

describe('DataUnion transfer within contract', () => {
    let adminClient: StreamrClient

    beforeAll(async () => {
        log('Connecting to Ethereum networks, clientOptions: %o', clientOptions)
        const network = await providerMainnet.getNetwork()
        log('Connected to "mainnet" network: ', JSON.stringify(network))
        const network2 = await providerSidechain.getNetwork()
        log('Connected to sidechain network: ', JSON.stringify(network2))
        log(`Minting 100 tokens to ${tokenAdminWallet.address}`)
        const tx1 = await tokenMainnet.mint(tokenAdminWallet.address, parseEther('100'))
        await tx1.wait()

        await sendTokensToSidechain(adminWalletSidechain.address, parseEther('10'))

        adminClient = new StreamrClient(clientOptions as any)
    }, 150000)

    afterAll(() => {
        providerMainnet.removeAllListeners()
        providerSidechain.removeAllListeners()
    })

    it('transfer token to member', async () => {
        const dataUnion = await adminClient.deployDataUnion()
        const secret = await dataUnion.createSecret('test secret')
        // eslint-disable-next-line no-underscore-dangle
        const contract = await dataUnion._getContract()
        log(`DU owner: ${await dataUnion.getAdminAddress()}`)
        log(`Sending tx from ${await adminClient.getAddress()}`)

        // product is needed for join requests to analyze the DU version
        const createProductUrl = getEndpointUrl(clientOptions.restUrl, 'products')
        await authFetch(createProductUrl, adminClient.session, {
            method: 'POST',
            body: JSON.stringify({
                beneficiaryAddress: dataUnion.getAddress(),
                type: 'DATAUNION',
                dataUnionVersion: 2
            })
        })

        const memberWallet = new Wallet(`0x100000000000000000000000000000000000000012300000001${Date.now()}`, providerSidechain)
        const memberClient = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: memberWallet.privateKey
            }
        } as any)
        const res = await memberClient.getDataUnion(dataUnion.getAddress()).join(secret)
        log(`Member joined data union: ${JSON.stringify(res)}`)
        log(`DU member count: ${await contract.sidechain.activeMemberCount()}`)

        const stats = await memberClient.getDataUnion(dataUnion.getAddress()).getMemberStats(memberWallet.address)
        log(`Stats: ${JSON.stringify(stats)}`)

        const approve = await tokenSidechain.approve(dataUnion.getSidechainAddress(), parseEther('1'))
        await approve.wait()
        log(`Approve DU ${dataUnion.getSidechainAddress()} to access 1 token from ${adminWalletSidechain.address}`)

        await dataUnion.transferToMemberInContract(memberWallet.address, parseEther('1'))
        log(`Transfer 1 token with transferWithinContract to ${memberWallet.address}`)

        const newStats = await memberClient.getDataUnion(dataUnion.getAddress()).getMemberStats(memberWallet.address)
        log(`Stats: ${JSON.stringify(newStats)}`)

        expect(stats).toMatchObject({
            status: MemberStatus.ACTIVE,
            earningsBeforeLastJoin: BigNumber.from(0),
            totalEarnings: BigNumber.from(0),
            withdrawableEarnings: BigNumber.from(0)
        })
        expect(newStats).toMatchObject({
            status: MemberStatus.ACTIVE,
            earningsBeforeLastJoin: parseEther('1'),
            totalEarnings: parseEther('1'),
            withdrawableEarnings: parseEther('1')
        })
    }, 150000)
})
