import { BigNumber, Contract, providers, Wallet } from 'ethers'
import { formatEther, parseEther, defaultAbiCoder } from 'ethers/lib/utils'
import { ContractReceipt } from '@ethersproject/contracts'
import { keccak256 } from '@ethersproject/keccak256'

import debug from 'debug'

import { getEndpointUrl, until } from '../../../src/utils'
import { StreamrClient } from '../../../src/StreamrClient'
import * as Token from '../../../contracts/TestToken.json'
import * as DataUnionSidechain from '../../../contracts/DataUnionSidechain.json'
import config from '../config'
import authFetch from '../../../src/rest/authFetch'
import { createClient, createMockAddress, expectInvalidAddress } from '../../utils'
import { AmbMessageHash, DataUnionWithdrawOptions, MemberStatus } from '../../../src/dataunion/DataUnion'
import { EthereumAddress } from '../../../src'

const log = debug('StreamrClient::DataUnion::integration-test-withdraw')

const providerSidechain = new providers.JsonRpcProvider(config.clientOptions.sidechain)
const providerMainnet = new providers.JsonRpcProvider(config.clientOptions.mainnet)
const adminWalletMainnet = new Wallet(config.clientOptions.auth.privateKey, providerMainnet)
const adminWalletSidechain = new Wallet(config.clientOptions.auth.privateKey, providerSidechain)

const tokenAdminWallet = new Wallet(config.tokenAdminPrivateKey, providerMainnet)
const tokenMainnet = new Contract(config.clientOptions.tokenAddress, Token.abi, tokenAdminWallet)

const tokenSidechain = new Contract(config.clientOptions.tokenSidechainAddress, Token.abi, adminWalletSidechain)

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
) {
    log(`Connecting to Ethereum networks, config = ${JSON.stringify(config)}`)
    const network = await providerMainnet.getNetwork()
    log('Connected to "mainnet" network: ', JSON.stringify(network))
    const network2 = await providerSidechain.getNetwork()
    log('Connected to sidechain network: ', JSON.stringify(network2))

    log(`Minting 100 tokens to ${adminWalletMainnet.address}`)
    const tx1 = await tokenMainnet.mint(adminWalletMainnet.address, parseEther('100'))
    await tx1.wait()

    const adminClient = new StreamrClient(config.clientOptions)

    const dataUnion = await adminClient.deployDataUnion()
    const secret = await dataUnion.createSecret('test secret')
    log(`DataUnion ${dataUnion.getAddress()} is ready to roll`)
    // dataUnion = await adminClient.getDataUnionContract({dataUnion: "0xd778CfA9BB1d5F36E42526B2BAFD07B74b4066c0"})

    testWalletId += 1
    const memberWallet = new Wallet(`0x100000000000000000000000000000000000000012300000000000001${testWalletId}`, providerSidechain)
    const recipient = recipientAddress || memberWallet.address
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
    })

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

    const getRecipientBalance = async () => (
        options.sendToMainnet
            ? memberClient.getTokenBalance(recipient)
            : memberClient.getSidechainTokenBalance(recipient)
    )

    const balanceBefore = await getRecipientBalance()
    log(`Balance before: ${balanceBefore}. Withdrawing tokens...`)

    // "bridge-sponsored mainnet withdraw" case
    if (!options.payForTransport && options.waitUntilTransportIsComplete) {
        log(`Adding ${recipient} to bridge-sponsored withdraw whitelist`)
        bridgeWhitelist.push(recipient)
    }

    // test setup done, do the withdraw
    let ret = await withdraw(dataUnion.getAddress(), memberClient, memberWallet, adminClient)

    // "other-sponsored mainnet withdraw" case
    if (typeof ret === 'string') {
        log(`Transporting message "${ret}"`)
        ret = await dataUnion.transportMessage(String(ret))
    }
    log(`Tokens withdrawn, return value: ${JSON.stringify(ret)}`)

    // "skip waiting" or "without checking the recipient account" case
    // we need to wait nevertheless, to be able to assert that balance in fact changed
    if (!options.waitUntilTransportIsComplete) {
        log(`Waiting until balance changes from ${balanceBefore.toString()}`)
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
    expect(balanceIncrease.toString()).toBe(amount.toString())
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
    log(`Observed signature request for message id=${event.topics[1]}`) // messageId is indexed so it's in topics...
    const message = defaultAbiCoder.decode(['bytes'], event.data)[0] // ...only encodedData is in data
    const recipient = '0x' + message.slice(200, 240)
    if (!bridgeWhitelist.find((address) => address.toLowerCase() === recipient)) {
        log(`Recipient ${recipient} not whitelisted, ignoring`)
        return
    }
    const hash = keccak256(message)
    const adminClient = new StreamrClient(config.clientOptions)
    await adminClient.getDataUnion('0x0000000000000000000000000000000000000000').transportMessage(hash, 100, 120000)
    log(`Transported message hash=${hash}`)
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
            expectInvalidAddress(() => dataUnion.withdrawAllToSigned('invalid-address', 'invalid-address', 'mock-signature'))
        ])
    })
})
