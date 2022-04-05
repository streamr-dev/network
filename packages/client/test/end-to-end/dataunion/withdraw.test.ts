import { BigNumber, Contract, providers, Wallet } from 'ethers'
import { formatEther, parseEther, defaultAbiCoder } from 'ethers/lib/utils'
import { ContractReceipt } from '@ethersproject/contracts'
import { keccak256 } from '@ethersproject/keccak256'

import debug from 'debug'

import { getEndpointUrl, until } from '../../../src/utils'
import { StreamrClient } from '../../../src/StreamrClient'
import Contracts from '../../../src/dataunion/Contracts'
import DataUnionAPI from '../../../src/dataunion'
import * as Token from '../../../contracts/TestToken.json'
import * as DataUnionSidechain from '../../../contracts/DataUnionSidechain.json'
import { dataUnionAdminPrivateKey, tokenAdminPrivateKey } from '../devEnvironment'
import { ConfigTest } from '../../../src/ConfigTest'
import { authFetch } from '../../../src/authFetch'
import { expectInvalidAddress } from '../../test-utils/utils'
import { AmbMessageHash, DataUnionWithdrawOptions, MemberStatus, DataUnion } from '../../../src/dataunion/DataUnion'
import { EthereumAddress } from 'streamr-client-protocol'
import { BrubeckConfig } from '../../../src/Config'

const log = debug('StreamrClient::DataUnion::integration-test-withdraw')

const providerSidechain = new providers.JsonRpcProvider(ConfigTest.dataUnionChainRPCs.rpcs[0])
const providerMainnet = new providers.JsonRpcProvider(ConfigTest.mainChainRPCs.rpcs[0])
const adminWalletMainnet = new Wallet(dataUnionAdminPrivateKey, providerMainnet)
const adminWalletSidechain = new Wallet(dataUnionAdminPrivateKey, providerSidechain)

const tokenAdminWallet = new Wallet(tokenAdminPrivateKey, providerMainnet)
const tokenMainnet = new Contract(ConfigTest.tokenAddress, Token.abi, tokenAdminWallet)

const tokenSidechain = new Contract(ConfigTest.tokenSidechainAddress, Token.abi, adminWalletSidechain)

let testWalletId = 1000000 // ensure fixed length as string

// TODO: to speed up this test, try re-using the data union?
let validDataUnion: DataUnion | undefined // use this in a test that only wants a valid data union but doesn't mutate it
async function getDataUnion(): Promise<DataUnion> {
    return validDataUnion || new StreamrClient(ConfigTest).deployDataUnion()
}

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
    log('Connecting to Ethereum networks, clientOptions: %O', ConfigTest)
    const network = await providerMainnet.getNetwork()
    log('Connected to "mainnet" network: %O', network)
    const network2 = await providerSidechain.getNetwork()
    log('Connected to sidechain network: %O', network2)

    log('Minting 100 tokens to %s', adminWalletMainnet.address)
    const tx1 = await tokenMainnet.mint(adminWalletMainnet.address, parseEther('100'))
    await tx1.wait()

    const adminClient = new StreamrClient(ConfigTest)

    const dataUnion = await adminClient.deployDataUnion()
    validDataUnion = dataUnion // save for later re-use
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
        ...ConfigTest,
        auth: {
            privateKey: memberWallet.privateKey
        }
    })
    const dataUnionMember = await memberClient.getDataUnion(dataUnion.getAddress())

    // product is needed for join requests to analyze the DU version
    const createProductUrl = getEndpointUrl(ConfigTest.restUrl, 'products')
    await authFetch(createProductUrl, {
        method: 'POST',
        body: JSON.stringify({
            beneficiaryAddress: dataUnion.getAddress(),
            type: 'DATAUNION',
            dataUnionVersion: 2
        }),
        // @ts-expect-error
        session: adminClient.session,
    })
    const res1 = await dataUnion.join(secret)
    log('Admin joined data union %O', res1)
    const res2 = await dataUnionMember.join(secret)
    log('Member joined data union %O', res2)

    const contracts = new Contracts(new DataUnionAPI(adminClient, null!, BrubeckConfig(ConfigTest)))
    const mainnetContract = await contracts.getMainnetContract(dataUnion.getAddress())
    const sidechainContractLimited = await contracts.getSidechainContract(dataUnion.getAddress())

    // make a "full" sidechain contract object that has all functions, not just those required by StreamrClient
    const sidechainContract = new Contract(sidechainContractLimited.address, DataUnionSidechain.abi, adminWalletSidechain)

    const tokenAddress = await mainnetContract.tokenMainnet()
    log('Token address: %s', tokenAddress)
    const adminTokenMainnet = new Contract(tokenAddress, Token.abi, adminWalletMainnet)
    async function logBalance(owner: string, address: EthereumAddress) {
        const balance = await adminTokenMainnet.balanceOf(address)
        log('%s (%s) mainnet token balance: %s (%s)', owner, address, formatEther(balance), balance.toString())
    }

    const amount = parseEther('1')
    const duSidechainEarningsBefore = await sidechainContract.totalEarnings()

    await logBalance('Data union', dataUnion.getAddress())
    await logBalance('Admin', adminWalletMainnet.address)

    log('Transferring %s token-wei %s->%s', amount, adminWalletMainnet.address, dataUnion.getAddress())
    const txTokenToDU = await adminTokenMainnet.transfer(dataUnion.getAddress(), amount)
    await txTokenToDU.wait()

    await logBalance('Data union', dataUnion.getAddress())
    await logBalance('Admin', adminWalletMainnet.address)

    log('DU member count: %d', await sidechainContract.activeMemberCount())

    log('Transferred %s tokens, next sending to bridge', formatEther(amount))
    const tx2 = await mainnetContract.sendTokensToBridge()
    const tr2 = await tx2.wait()
    log('sendTokensToBridge returned %O', tr2)

    log('Waiting for the tokens to appear at sidechain %s', sidechainContract.address)
    await until(async () => !(await tokenSidechain.balanceOf(sidechainContract.address)).eq('0'), 300000, 3000)
    log('Confirmed tokens arrived, DU balance: %s -> %s', duSidechainEarningsBefore, await sidechainContract.totalEarnings())

    const tx3 = await sidechainContract.refreshRevenue()
    const tr3 = await tx3.wait()
    log('refreshRevenue returned %O', tr3)
    log('DU sidechain totalEarnings: %O', await sidechainContract.totalEarnings())

    await logBalance('Data union', dataUnion.getAddress())
    await logBalance('Admin', adminWalletMainnet.address)

    const stats = await dataUnion.getMemberStats(memberWallet.address)
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

    expect(stats.status).toEqual(MemberStatus.ACTIVE)
    expect(stats.earningsBeforeLastJoin.toNumber()).toEqual(0)
    expect(stats.totalEarnings.toString()).toEqual('1000000000000000000')
    expect(stats.withdrawableEarnings.toString()).toEqual('1000000000000000000')
    expect(balanceIncrease.toString()).toEqual((expectedWithdrawAmount || amount).toString())
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
    const adminClient = new StreamrClient(ConfigTest)
    const dataUnion = new DataUnion(
        '0x0000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000000',
        new DataUnionAPI(adminClient, null!, BrubeckConfig(ConfigTest))
    )
    await dataUnion.transportMessage(hash, 100, 120000)
    log('Transported message (hash=%s)', hash)
})

describe('DataUnion withdrawX functions', () => {
    describe.each([
        [false, true, true], // sidechain withdraw
        [true, true, true], // self-service mainnet withdraw
        [true, true, false], // self-service mainnet withdraw without checking the recipient account
        [true, false, true], // bridge-sponsored mainnet withdraw
        [true, false, false], // other-sponsored mainnet withdraw
    ])('with options: sendToMainnet=%p, payForTransport=%p, wait=%p', (sendToMainnet, payForTransport, waitUntilTransportIsComplete) => {

        // for test debugging: select only one case by uncommenting below, and comment out the above .each block
        // const [sendToMainnet, payForTransport, waitUntilTransportIsComplete] = [true, false, true] // bridge-sponsored mainnet withdraw

        const options = { sendToMainnet, payForTransport, waitUntilTransportIsComplete }

        describe('by member', () => {

            it('to itself', () => {
                return testWithdraw(async (dataUnionAddress, memberClient) => {
                    const du = await memberClient.getDataUnion(dataUnionAddress)
                    return du.withdrawAll(options)
                }, null, true, options)
            }, 3600000)

            it('to any address', () => {
                testWalletId += 1
                const outsiderWallet = new Wallet(`0x100000000000000000000000000000000000000012300000002${testWalletId}`, providerSidechain)
                return testWithdraw(async (dataUnionAddress, memberClient) => {
                    const du = await memberClient.getDataUnion(dataUnionAddress)
                    return du.withdrawAllTo(outsiderWallet.address, options)
                }, outsiderWallet.address, true, options)
            }, 3600000)

        })

        describe('by admin', () => {

            it('to member without signature', async () => {
                return testWithdraw(async (dataUnionAddress, memberClient, memberWallet) => {
                    const du = await memberClient.getDataUnion(dataUnionAddress)
                    return du.withdrawAllToMember(memberWallet.address, options)
                }, null, false, options)
            }, 3600000)

            it("to anyone with member's signature", async () => {
                testWalletId += 1
                const member2Wallet = new Wallet(`0x100000000000000000000000000040000000000012300000007${testWalletId}`, providerSidechain)
                return testWithdraw(async (dataUnionAddress, memberClient, memberWallet, adminClient) => {
                    const duMember = await memberClient.getDataUnion(dataUnionAddress)
                    const duAdmin = await adminClient.getDataUnion(dataUnionAddress)
                    const signature = await duMember.signWithdrawAllTo(member2Wallet.address)
                    return duAdmin.withdrawAllToSigned(memberWallet.address, member2Wallet.address, signature, options)
                }, member2Wallet.address, false, options)
            }, 3600000)

            it("to anyone a specific amount with member's signature", async () => {
                testWalletId += 1
                const withdrawAmount = parseEther('0.5')
                const member2Wallet = new Wallet(`0x100000000000000000000000000040000000000012300000007${testWalletId}`, providerSidechain)
                return testWithdraw(async (dataUnionAddress, memberClient, memberWallet, adminClient) => {
                    const duMember = await memberClient.getDataUnion(dataUnionAddress)
                    const duAdmin = await adminClient.getDataUnion(dataUnionAddress)
                    const signature = await duMember.signWithdrawAmountTo(member2Wallet.address, withdrawAmount)
                    return duAdmin.withdrawAmountToSigned(memberWallet.address, member2Wallet.address, withdrawAmount, signature, options)
                }, member2Wallet.address, false, options, withdrawAmount)
            }, 3600000)
        })
    })

    it('validates input addresses', async () => {
        const dataUnion = await getDataUnion()
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
