import { BigNumber, Contract, providers, Wallet } from 'ethers'
import { formatEther, parseEther } from 'ethers/lib/utils'
import { TransactionReceipt } from '@ethersproject/providers'
import debug from 'debug'

import { getEndpointUrl, until } from '../../../src/utils'
import { StreamrClient } from '../../../src/StreamrClient'
import * as Token from '../../../contracts/TestToken.json'
import * as DataUnionSidechain from '../../../contracts/DataUnionSidechain.json'
import config from '../config'
import authFetch from '../../../src/rest/authFetch'
import { createClient, createMockAddress, expectInvalidAddress } from '../../utils'
import { MemberStatus } from '../../../src/dataunion/DataUnion'

const log = debug('StreamrClient::DataUnion::integration-test-withdraw')

// @ts-expect-error
const providerSidechain = new providers.JsonRpcProvider(config.clientOptions.sidechain)
// @ts-expect-error
const providerMainnet = new providers.JsonRpcProvider(config.clientOptions.mainnet)
const adminWalletMainnet = new Wallet(config.clientOptions.auth.privateKey, providerMainnet)
const adminWalletSidechain = new Wallet(config.clientOptions.auth.privateKey, providerSidechain)

const tokenAdminWallet = new Wallet(config.tokenAdminPrivateKey, providerMainnet)
const tokenMainnet = new Contract(config.clientOptions.tokenAddress, Token.abi, tokenAdminWallet)

const tokenSidechain = new Contract(config.clientOptions.tokenSidechainAddress, Token.abi, adminWalletSidechain)

const testWithdraw = async (
    getBalance: (memberWallet: Wallet) => Promise<BigNumber>,
    withdraw: (
        dataUnionAddress: string,
        memberClient: StreamrClient,
        memberWallet: Wallet,
        adminClient: StreamrClient
    ) => Promise<TransactionReceipt>,
    requiresMainnetETH: boolean,
) => {
    log(`Connecting to Ethereum networks, config = ${JSON.stringify(config)}`)
    const network = await providerMainnet.getNetwork()
    log('Connected to "mainnet" network: ', JSON.stringify(network))
    const network2 = await providerSidechain.getNetwork()
    log('Connected to sidechain network: ', JSON.stringify(network2))

    log(`Minting 100 tokens to ${adminWalletMainnet.address}`)
    const tx1 = await tokenMainnet.mint(adminWalletMainnet.address, parseEther('100'))
    await tx1.wait()

    const adminClient = new StreamrClient(config.clientOptions as any)

    const dataUnion = await adminClient.deployDataUnion()
    const secret = await dataUnion.createSecret('test secret')
    log(`DataUnion ${dataUnion.getAddress()} is ready to roll`)
    // dataUnion = await adminClient.getDataUnionContract({dataUnion: "0xd778CfA9BB1d5F36E42526B2BAFD07B74b4066c0"})

    const memberWallet = new Wallet(`0x100000000000000000000000000000000000000012300000001${Date.now()}`, providerSidechain)
    const sendTx = await adminWalletSidechain.sendTransaction({ to: memberWallet.address, value: parseEther('0.1') })
    await sendTx.wait()
    log(`Sent 0.1 sidechain-ETH to ${memberWallet.address}`)

    if (requiresMainnetETH) {
        const send2Tx = await adminWalletMainnet.sendTransaction({ to: memberWallet.address, value: parseEther('0.1') })
        await send2Tx.wait()
        log(`Sent 0.1 mainnet-ETH to ${memberWallet.address}`)
    }

    const memberClient = new StreamrClient({
        ...config.clientOptions,
        auth: {
            privateKey: memberWallet.privateKey
        }
    } as any)

    // product is needed for join requests to analyze the DU version
    const createProductUrl = getEndpointUrl(config.clientOptions.restUrl, 'products')
    await authFetch(createProductUrl, adminClient.session, {
        method: 'POST',
        body: JSON.stringify({
            beneficiaryAddress: dataUnion.getAddress(),
            type: 'DATAUNION',
            dataUnionVersion: 2
        })
    })
    const res = await memberClient.getDataUnion(dataUnion.getAddress()).join(secret)
    // await adminClient.addMembers([memberWallet.address], { dataUnion })
    log(`Member joined data union: ${JSON.stringify(res)}`)

    // eslint-disable-next-line no-underscore-dangle
    const contract = await dataUnion._getContract()
    const tokenAddress = await contract.token()
    log(`Token address: ${tokenAddress}`)
    const adminTokenMainnet = new Contract(tokenAddress, Token.abi, adminWalletMainnet)

    const amount = parseEther('1')
    const duSidechainEarningsBefore = await contract.sidechain.totalEarnings()

    const duBalance1 = await adminTokenMainnet.balanceOf(dataUnion.getAddress())
    log(`Token balance of ${dataUnion.getAddress()}: ${formatEther(duBalance1)} (${duBalance1.toString()})`)
    const balance1 = await adminTokenMainnet.balanceOf(adminWalletMainnet.address)
    log(`Token balance of ${adminWalletMainnet.address}: ${formatEther(balance1)} (${balance1.toString()})`)

    log(`Transferring ${amount} token-wei ${adminWalletMainnet.address}->${dataUnion.getAddress()}`)
    const txTokenToDU = await adminTokenMainnet.transfer(dataUnion.getAddress(), amount)
    await txTokenToDU.wait()

    const duBalance2 = await adminTokenMainnet.balanceOf(dataUnion.getAddress())
    log(`Token balance of ${dataUnion.getAddress()}: ${formatEther(duBalance2)} (${duBalance2.toString()})`)
    const balance2 = await adminTokenMainnet.balanceOf(adminWalletMainnet.address)
    log(`Token balance of ${adminWalletMainnet.address}: ${formatEther(balance2)} (${balance2.toString()})`)

    log(`DU member count: ${await contract.sidechain.activeMemberCount()}`)

    log(`Transferred ${formatEther(amount)} tokens, next sending to bridge`)
    const tx2 = await contract.sendTokensToBridge()
    await tx2.wait()

    log(`Sent to bridge, waiting for the tokens to appear at ${contract.sidechain.address} in sidechain`)
    await until(async () => !(await tokenSidechain.balanceOf(contract.sidechain.address)).eq('0'), 300000, 3000)
    log(`Confirmed tokens arrived, DU balance: ${duSidechainEarningsBefore} -> ${await contract.sidechain.totalEarnings()}`)

    // make a "full" sidechain contract object that has all functions, not just those required by StreamrClient
    const sidechainContract = new Contract(contract.sidechain.address, DataUnionSidechain.abi, adminWalletSidechain)
    const tx3 = await sidechainContract.refreshRevenue()
    const tr3 = await tx3.wait()
    log(`refreshRevenue returned ${JSON.stringify(tr3)}`)
    log(`DU balance: ${await contract.sidechain.totalEarnings()}`)

    const duBalance3 = await adminTokenMainnet.balanceOf(dataUnion.getAddress())
    log(`Token balance of ${dataUnion.getAddress()}: ${formatEther(duBalance3)} (${duBalance3.toString()})`)
    const balance3 = await adminTokenMainnet.balanceOf(adminWalletMainnet.address)
    log(`Token balance of ${adminWalletMainnet.address}: ${formatEther(balance3)} (${balance3.toString()})`)

    const stats = await memberClient.getDataUnion(dataUnion.getAddress()).getMemberStats(memberWallet.address)
    log(`Stats: ${JSON.stringify(stats)}`)

    // test setup done, do the withdraw
    const balanceBefore = await getBalance(memberWallet)
    log(`Balance before: ${balanceBefore}. Withdrawing tokens...`)

    const withdrawTr = await withdraw(dataUnion.getAddress(), memberClient, memberWallet, adminClient)
    log(`Tokens withdrawn, sidechain tx receipt: ${JSON.stringify(withdrawTr)}`)
    const balanceAfter = await getBalance(memberWallet)
    const balanceIncrease = balanceAfter.sub(balanceBefore)

    expect(stats).toMatchObject({
        status: MemberStatus.ACTIVE,
        earningsBeforeLastJoin: BigNumber.from(0),
        totalEarnings: BigNumber.from('1000000000000000000'),
        withdrawableEarnings: BigNumber.from('1000000000000000000')
    })
    expect(balanceIncrease.toString()).toBe(amount.toString())
}

describe('DataUnion withdraw', () => {

    const balanceClient = createClient()

    afterAll(() => {
        providerMainnet.removeAllListeners()
        providerSidechain.removeAllListeners()
    })

    for (const sendToMainnet of [true, false]) {

        const getTokenBalance = async (wallet: Wallet) => {
            return sendToMainnet ? balanceClient.getTokenBalance(wallet.address) : balanceClient.getSidechainTokenBalance(wallet.address)
        }

        describe('Withdrawing to ' + (sendToMainnet ? 'mainnet' : 'sidechain'), () => {

            describe('Member', () => {

                it('by member itself', () => {
                    const getBalance = async (memberWallet: Wallet) => getTokenBalance(memberWallet)
                    const withdraw = async (dataUnionAddress: string, memberClient: StreamrClient) => (
                        memberClient.getDataUnion(dataUnionAddress).withdrawAll({ sendToMainnet })
                    )
                    return testWithdraw(getBalance, withdraw, true)
                }, 300000)

                it('from member to any address', () => {
                    const outsiderWallet = new Wallet(`0x100000000000000000000000000000000000000012300000002${Date.now()}`, providerSidechain)
                    const getBalance = async () => getTokenBalance(outsiderWallet)
                    const withdraw = (dataUnionAddress: string, memberClient: StreamrClient) => (
                        memberClient.getDataUnion(dataUnionAddress).withdrawAllTo(outsiderWallet.address, { sendToMainnet })
                    )
                    return testWithdraw(getBalance, withdraw, true)
                }, 300000)

            })

            describe('Admin', () => {

                it('non-signed', async () => {
                    const getBalance = async (memberWallet: Wallet) => getTokenBalance(memberWallet)
                    const withdraw = (dataUnionAddress: string, _: StreamrClient, memberWallet: Wallet, adminClient: StreamrClient) => (
                        adminClient.getDataUnion(dataUnionAddress).withdrawAllToMember(memberWallet.address, { sendToMainnet })
                    )
                    return testWithdraw(getBalance, withdraw, false)
                }, 300000)

                it('signed', async () => {
                    const member2Wallet = new Wallet(`0x100000000000000000000000000040000000000012300000007${Date.now()}`, providerSidechain)
                    const getBalance = async () => getTokenBalance(member2Wallet)
                    const withdraw = async (
                        dataUnionAddress: string,
                        memberClient: StreamrClient,
                        memberWallet: Wallet,
                        adminClient: StreamrClient
                    ) => {
                        const signature = await memberClient.getDataUnion(dataUnionAddress).signWithdrawAllTo(member2Wallet.address)
                        const withdrawTr = await adminClient
                            .getDataUnion(dataUnionAddress)
                            .withdrawAllToSigned(memberWallet.address, member2Wallet.address, signature, { sendToMainnet })
                        return withdrawTr
                    }
                    return testWithdraw(getBalance, withdraw, false)
                }, 300000)
            })
        })
    }

    it('Validate address', async () => {
        const client = createClient(providerSidechain)
        const dataUnion = client.getDataUnion(createMockAddress())
        return Promise.all([
            expectInvalidAddress(() => dataUnion.getWithdrawableEarnings('invalid-address')),
            expectInvalidAddress(() => dataUnion.withdrawAllTo('invalid-address')),
            expectInvalidAddress(() => dataUnion.signWithdrawAllTo('invalid-address')),
            expectInvalidAddress(() => dataUnion.signWithdrawAmountTo('invalid-address', '123')),
            expectInvalidAddress(() => dataUnion.withdrawAllToMember('invalid-address')),
            expectInvalidAddress(() => dataUnion.withdrawAllToSigned('invalid-address', 'invalid-address', 'mock-signature'))
        ])
    })
})
