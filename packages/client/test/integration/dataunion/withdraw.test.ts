import { BigNumber, Contract, providers, Wallet } from 'ethers'
import { formatEther, parseEther, defaultAbiCoder } from 'ethers/lib/utils'
import { ContractReceipt } from '@ethersproject/contracts'
import { keccak256 } from '@ethersproject/keccak256'

import debug from 'debug'

import { getEndpointUrl, until } from '../../../src/utils'
import { StreamrClient } from '../../../src/StreamrClient'
import * as Token from '../../../contracts/TestToken.json'
import * as DataUnionSidechain from '../../../contracts/DataUnionSidechain.json'
import { clientOptions, tokenAdminPrivateKey } from '../devEnvironment'
import authFetch from '../../../src/rest/authFetch'
import { createClient, createMockAddress, expectInvalidAddress } from '../../utils'
import { AmbMessageHash, DataUnionWithdrawOptions, MemberStatus } from '../../../src/dataunion/DataUnion'
import { EthereumAddress } from '../../../src'

const log = debug('StreamrClient::DataUnion::integration-test-withdraw')

const providerSidechain = new providers.JsonRpcProvider(clientOptions.sidechain)
const providerMainnet = new providers.JsonRpcProvider(clientOptions.mainnet)
const adminWalletMainnet = new Wallet(clientOptions.auth.privateKey, providerMainnet)
const adminWalletSidechain = new Wallet(clientOptions.auth.privateKey, providerSidechain)

const tokenAdminWallet = new Wallet(tokenAdminPrivateKey, providerMainnet)
const tokenMainnet = new Contract(clientOptions.tokenAddress, Token.abi, tokenAdminWallet)

const tokenSidechain = new Contract(clientOptions.tokenSidechainAddress, Token.abi, adminWalletSidechain)

let testWalletId = 1000000 // ensure fixed length as string

async function testWithdraw(
    withdraw: (
        dataUnionAddress: EthereumAddress,
        memberClient: StreamrClient,
        memberWallet: Wallet,
        adminClient: StreamrClient
    ) => Promise<ContractReceipt | AmbMessageHash | null>,
    recipientAddress: EthereumAddress | null, // null means memberWallet.address
    requiresMainnetETH: boolean,
    options: DataUnionWithdrawOptions,
    expectedWithdrawAmount?: BigNumber,
) {
    log('Connecting to Ethereum networks, clientOptions: %O', clientOptions)
    const network = await providerMainnet.getNetwork()
    log('Connected to "mainnet" network: %O', network)
    const network2 = await providerSidechain.getNetwork()
    log('Connected to sidechain network: %O', network2)

    log('Minting 100 tokens to %s', adminWalletMainnet.address)
    const tx1 = await tokenMainnet.mint(adminWalletMainnet.address, parseEther('100'))
    await tx1.wait()

    const adminClient = new StreamrClient(clientOptions)

    const dataUnion = await adminClient.deployDataUnion()
    const secret = await dataUnion.createSecret('test secret')
    log('DataUnion %s is ready to roll', dataUnion.getAddress())
    // dataUnion = await adminClient.getDataUnionContract({dataUnion: "0xd778CfA9BB1d5F36E42526B2BAFD07B74b4066c0"})

    testWalletId += 1
    const memberWallet = new Wallet(`0x100000000000000000000000000000000000000012300000000000001${testWalletId}`, providerSidechain)
    const recipient = recipientAddress || memberWallet.address
    const sendTx = await adminWalletSidechain.sendTransaction({ to: memberWallet.address, value: parseEther('0.1') })
    await sendTx.wait()
    log('Sent 0.1 sidechain-ETH to %s', memberWallet.address)

    if (requiresMainnetETH) {
        const send2Tx = await adminWalletMainnet.sendTransaction({ to: memberWallet.address, value: parseEther('0.1') })
        await send2Tx.wait()
        log('Sent 0.1 mainnet-ETH to %s', memberWallet.address)
    }

    const memberClient = new StreamrClient({
        ...clientOptions,
        auth: {
            privateKey: memberWallet.privateKey
        }
    })

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
    const res = await memberClient.getDataUnion(dataUnion.getAddress()).join(secret)
    // await adminClient.addMembers([memberWallet.address], { dataUnion })
    log('Member joined data union %O', res)

    // eslint-disable-next-line no-underscore-dangle
    const contract = await dataUnion._getContract()
    const tokenAddress = await contract.token()
    log('Token address: %s', tokenAddress)
    const adminTokenMainnet = new Contract(tokenAddress, Token.abi, adminWalletMainnet)
    async function logBalance(owner: string, address: EthereumAddress) {
        const balance = await adminTokenMainnet.balanceOf(address)
        log('%s (%s) mainnet token balance: %s (%s)', owner, address, formatEther(balance), balance.toString())
    }

    const amount = parseEther('1')
    const duSidechainEarningsBefore = await contract.sidechain.totalEarnings()

    await logBalance('Data union', dataUnion.getAddress())
    await logBalance('Admin', adminWalletMainnet.address)

    log('Transferring %s token-wei %s->%s', amount, adminWalletMainnet.address, dataUnion.getAddress())
    const txTokenToDU = await adminTokenMainnet.transfer(dataUnion.getAddress(), amount)
    await txTokenToDU.wait()

    await logBalance('Data union', dataUnion.getAddress())
    await logBalance('Admin', adminWalletMainnet.address)

    log('DU member count: %d', await contract.sidechain.activeMemberCount())

    log('Transferred %s tokens, next sending to bridge', formatEther(amount))
    const tx2 = await contract.sendTokensToBridge()
    const tr2 = await tx2.wait()
    log('sendTokensToBridge returned %O', tr2)

    log('Waiting for the tokens to appear at sidechain %s', contract.sidechain.address)
    await until(async () => !(await tokenSidechain.balanceOf(contract.sidechain.address)).eq('0'), 300000, 3000)
    log('Confirmed tokens arrived, DU balance: %s -> %s', duSidechainEarningsBefore, await contract.sidechain.totalEarnings())

    // make a "full" sidechain contract object that has all functions, not just those required by StreamrClient
    const sidechainContract = new Contract(contract.sidechain.address, DataUnionSidechain.abi, adminWalletSidechain)
    const tx3 = await sidechainContract.refreshRevenue()
    const tr3 = await tx3.wait()
    log('refreshRevenue returned %O', tr3)
    log('DU sidechain totalEarnings: %O', await contract.sidechain.totalEarnings())

    await logBalance('Data union', dataUnion.getAddress())
    await logBalance('Admin', adminWalletMainnet.address)

    const stats = await memberClient.getDataUnion(dataUnion.getAddress()).getMemberStats(memberWallet.address)
    log('Stats: %O', stats)

    const getRecipientBalance = async () => (
        options.sendToMainnet
            ? memberClient.getTokenBalance(recipient)
            : memberClient.getSidechainTokenBalance(recipient)
    )

    const balanceBefore = await getRecipientBalance()
    log('Balance before: %s. Withdrawing tokens...', balanceBefore)

    // "bridge-sponsored mainnet withdraw" case
    if (!options.payForTransport && options.waitUntilTransportIsComplete) {
        log('Adding %s to bridge-sponsored withdraw whitelist', recipient)
        bridgeWhitelist.push(recipient)
    }

    // test setup done, do the withdraw
    let ret = await withdraw(dataUnion.getAddress(), memberClient, memberWallet, adminClient)

    // "other-sponsored mainnet withdraw" case
    if (typeof ret === 'string') {
        log('Transporting message "%s"', ret)
        ret = await dataUnion.transportMessage(String(ret))
    }
    log('Tokens withdrawn, return value: %O', ret)

    // "skip waiting" or "without checking the recipient account" case
    // we need to wait nevertheless, to be able to assert that balance in fact changed
    if (!options.waitUntilTransportIsComplete) {
        log('Waiting until balance changes from %s', balanceBefore)
        await until(async () => getRecipientBalance().then((b) => !b.eq(balanceBefore)))
    }

    const balanceAfter = await getRecipientBalance()
    const balanceIncrease = balanceAfter.sub(balanceBefore)

    expect(stats).toMatchObject({
        status: MemberStatus.ACTIVE,
        earningsBeforeLastJoin: BigNumber.from(0),
        totalEarnings: BigNumber.from('1000000000000000000'),
        withdrawableEarnings: BigNumber.from('1000000000000000000')
    })
    expect(balanceIncrease.toString()).toBe((expectedWithdrawAmount || amount).toString())
}

log('Starting the simulated bridge-sponsored signature transport process')
// event UserRequestForSignature(bytes32 indexed messageId, bytes encodedData)
const signatureRequestEventSignature = '0x520d2afde79cbd5db58755ac9480f81bc658e5c517fcae7365a3d832590b0183'
const sidechainAmbAddress = '0xaFA0dc5Ad21796C9106a36D68f69aAD69994BB64'
const bridgeWhitelist: EthereumAddress[] = []
providerSidechain.on({
    address: sidechainAmbAddress,
    topics: [signatureRequestEventSignature]
}, async (event) => {
    log('Observed signature request for message (id=%s)', event.topics[1]) // messageId is indexed so it's in topics...
    const message = defaultAbiCoder.decode(['bytes'], event.data)[0] // ...only encodedData is in data
    const recipient = '0x' + message.slice(200, 240)
    if (!bridgeWhitelist.find((address) => address.toLowerCase() === recipient)) {
        log('Recipient %s not whitelisted, ignoring', recipient)
        return
    }
    const hash = keccak256(message)
    const adminClient = new StreamrClient(clientOptions)
    await adminClient.getDataUnion('0x0000000000000000000000000000000000000000').transportMessage(hash, 100, 120000)
    log('Transported message (hash=%s)', hash)
})

describe('DataUnion withdraw', () => {
    afterAll(() => {
        providerMainnet.removeAllListeners()
        providerSidechain.removeAllListeners()
    })

    describe.each([
        [false, true, true], // sidechain withdraw
        [true, true, true], // self-service mainnet withdraw
        [true, true, false], // self-service mainnet withdraw without checking the recipient account
        [true, false, true], // bridge-sponsored mainnet withdraw
        [true, false, false], // other-sponsored mainnet withdraw
    ])('Withdrawing with sendToMainnet=%p, payForTransport=%p, wait=%p', (sendToMainnet, payForTransport, waitUntilTransportIsComplete) => {

        // for test debugging: select only one case by uncommenting below, and comment out the above .each block
        // const [sendToMainnet, payForTransport, waitUntilTransportIsComplete] = [true, false, true] // bridge-sponsored mainnet withdraw

        const options = { sendToMainnet, payForTransport, waitUntilTransportIsComplete }

        describe('by member', () => {

            it('to itself', () => {
                return testWithdraw(async (dataUnionAddress, memberClient) => (
                    memberClient.getDataUnion(dataUnionAddress).withdrawAll(options)
                ), null, true, options)
            }, 3600000)

            it('to any address', () => {
                testWalletId += 1
                const outsiderWallet = new Wallet(`0x100000000000000000000000000000000000000012300000002${testWalletId}`, providerSidechain)
                return testWithdraw(async (dataUnionAddress, memberClient) => (
                    memberClient.getDataUnion(dataUnionAddress).withdrawAllTo(outsiderWallet.address, options)
                ), outsiderWallet.address, true, options)
            }, 3600000)

        })

        describe('by admin', () => {

            it('to member without signature', async () => {
                return testWithdraw(async (dataUnionAddress, memberClient, memberWallet, adminClient) => (
                    adminClient.getDataUnion(dataUnionAddress).withdrawAllToMember(memberWallet.address, options)
                ), null, false, options)
            }, 3600000)

            it("to anyone with member's signature", async () => {
                testWalletId += 1
                const member2Wallet = new Wallet(`0x100000000000000000000000000040000000000012300000007${testWalletId}`, providerSidechain)
                return testWithdraw(async (dataUnionAddress, memberClient, memberWallet, adminClient) => {
                    const signature = await memberClient.getDataUnion(dataUnionAddress).signWithdrawAllTo(member2Wallet.address)
                    return adminClient
                        .getDataUnion(dataUnionAddress)
                        .withdrawAllToSigned(memberWallet.address, member2Wallet.address, signature, options)
                }, member2Wallet.address, false, options)
            }, 3600000)

            it("to anyone a specific amount with member's signature", async () => {
                testWalletId += 1
                const withdrawAmount = parseEther('0.5')
                const member2Wallet = new Wallet(`0x100000000000000000000000000040000000000012300000007${testWalletId}`, providerSidechain)
                return testWithdraw(async (dataUnionAddress, memberClient, memberWallet, adminClient) => {
                    const signature = await memberClient.getDataUnion(dataUnionAddress).signWithdrawAmountTo(member2Wallet.address, withdrawAmount)
                    return adminClient
                        .getDataUnion(dataUnionAddress)
                        .withdrawAmountToSigned(memberWallet.address, member2Wallet.address, withdrawAmount, signature, options)
                }, member2Wallet.address, false, options, withdrawAmount)
            }, 3600000)
        })
    })

    it('Validate address', async () => {
        const client = createClient(providerSidechain)
        const dataUnion = client.getDataUnion(createMockAddress())
        return Promise.all([
            expectInvalidAddress(() => dataUnion.getWithdrawableEarnings('invalid-address')),
            expectInvalidAddress(() => dataUnion.withdrawAllTo('invalid-address')),
            expectInvalidAddress(() => dataUnion.signWithdrawAllTo('invalid-address')),
            expectInvalidAddress(() => dataUnion.signWithdrawAmountTo('invalid-address', '123')),
            expectInvalidAddress(() => dataUnion.withdrawAllToMember('invalid-address')),
            expectInvalidAddress(() => dataUnion.withdrawAllToSigned('invalid-address', 'invalid-address', 'mock-signature')),
            expectInvalidAddress(() => dataUnion.withdrawAmountToSigned('invalid-address', 'invalid-address', parseEther('1'), 'mock-signature')),
        ])
    })
})
