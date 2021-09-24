/* eslint-disable no-await-in-loop */
import { Contract, Wallet } from 'ethers'
import { formatEther, parseEther } from 'ethers/lib/utils'
import debug from 'debug'
import Token from '../../../contracts/TestToken.json'
import DataUnionSidechain from '../../../contracts/DataUnionSidechain.json'
import { clientOptions, tokenAdminPrivateKey, tokenMediatorAddress, relayTokensAbi, providerMainnet, providerSidechain, getMainnetTestWallet, getSidechainTestWallet } from '../devEnvironment'
import { getEndpointUrl, until } from '../../../src/utils'
import { StreamrClient } from '../../../src/StreamrClient'
import { EthereumAddress } from '../../../src/types'
import authFetch from '../../../src/rest/authFetch'

const log = debug('StreamrClient::DataUnion::integration-test-transfer')

const tokenAdminWallet = new Wallet(tokenAdminPrivateKey, providerMainnet)
const tokenMainnet = new Contract(clientOptions.tokenAddress, Token.abi, tokenAdminWallet)

const tokenAdminSidechainWallet = new Wallet(tokenAdminPrivateKey, providerSidechain)
const tokenSidechain = new Contract(clientOptions.tokenSidechainAddress, Token.abi, tokenAdminSidechainWallet)

async function addMember(dataUnionAddress: EthereumAddress, secret: string) {
    const privateKey = `0x100000000000000000000000000000000000000012300000001${Date.now()}`
    log('Joining a new member with privatekey %s', privateKey)
    const memberClient = new StreamrClient({
        ...clientOptions,
        auth: {
            privateKey
        }
    } as any)
    const memberDataUnion = memberClient.getDataUnion(dataUnionAddress) // TODO: await safeGetDataUnion
    const res = await memberDataUnion.join(secret)
    log('Member joined data union: %O', res)

    const memberWallet = new Wallet(privateKey, providerSidechain)
    return memberWallet
}

describe('DataUnion earnings transfer methods', () => {
    beforeAll(async () => {
        log('Connecting to Ethereum networks, clientOptions: %O', clientOptions)
        const network = await providerMainnet.getNetwork()
        log('Connected to "mainnet" network: %O', network)
        const network2 = await providerSidechain.getNetwork()
        log('Connected to sidechain network: %O', network2)

        // TODO: ALL of the below should be unnecessary after test wallets are properly set up in smart-contracts-init

        log('Minting 200 tokens to %s and sending 100 to sidechain', tokenAdminWallet.address)
        const mintTx = await tokenMainnet.mint(tokenAdminWallet.address, parseEther('200'))
        await mintTx.wait()
        const tokenMediator = new Contract(tokenMediatorAddress, relayTokensAbi, tokenAdminWallet)
        const approveTx = await tokenMainnet.approve(tokenMediator.address, parseEther('100'))
        await approveTx.wait()
        const relayTx = await tokenMediator.relayTokensAndCall(tokenMainnet.address, tokenAdminSidechainWallet.address, parseEther('100'), '0x1234') // dummy 0x1234
        await relayTx.wait()
        await until(async () => (await tokenSidechain.balanceOf(tokenAdminSidechainWallet.address)).gt('0'), 300000, 3000)

        log('Distributing mainnet ETH to following addresses:')
        for (let i = 1; i <= 2; i++) {
            const testWallet = getMainnetTestWallet(i)
            log('    #%d: %s', i, testWallet.address)
            const sendTx = await tokenAdminWallet.sendTransaction({
                to: testWallet.address,
                value: parseEther('1')
            })
            await sendTx.wait()
        }

        log('Distributing sidechain ETH to following addresses:')
        for (let i = 1; i <= 2; i++) {
            const testWallet = getSidechainTestWallet(i)
            log('    #%d: %s', i, testWallet.address)
            const sendTx = await tokenAdminSidechainWallet.sendTransaction({
                to: testWallet.address,
                value: parseEther('1')
            })
            await sendTx.wait()
        }

        log('Distributing 10 sidechain DATA to following addresses:')
        for (let i = 1; i <= 2; i++) {
            const testWallet = getSidechainTestWallet(i)
            log('    #%d: %s', i, testWallet.address)
            const sendTx = await tokenSidechain.transfer(testWallet.address, parseEther('10'))
            await sendTx.wait()
        }
    }, 1500000)

    async function setupTest(testIndex: number) {
        const adminWallet = getMainnetTestWallet(testIndex)
        const adminWalletSidechain = getSidechainTestWallet(testIndex)

        const adminClient = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: adminWallet.privateKey,
            },
        })

        const dataUnion = await adminClient.deployDataUnion()
        const dataUnionAddress = dataUnion.getAddress()
        const secret = await dataUnion.createSecret('test secret')
        const dataUnionSidechain = new Contract(dataUnion.getSidechainAddress(), DataUnionSidechain.abi, adminWalletSidechain)

        log('DU mainnet address: %s', dataUnionAddress)
        log('DU sidechain address: %s', dataUnionSidechain.address)
        log('DU owner: %s', await dataUnion.getAdminAddress())
        log('Sending tx from %s', await adminClient.getAddress())

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

        const memberWallet = await addMember(dataUnionAddress, secret)
        log(`DU member count: ${await dataUnionSidechain.activeMemberCount()}`)

        const member2Wallet = await addMember(dataUnionAddress, secret)
        log(`DU member count: ${await dataUnionSidechain.activeMemberCount()}`)

        log('Transfer sidechain ETH to %s for transferWithinContract tx', memberWallet.address)
        const sendTx = await adminWalletSidechain.sendTransaction({
            to: memberWallet.address,
            value: parseEther('0.1')
        })
        await sendTx.wait()

        const transferTx = await tokenSidechain.transfer(dataUnionSidechain.address, parseEther('4'))
        await transferTx.wait()
        log('sidechain token transfer done')

        const refreshTx = await dataUnionSidechain.refreshRevenue()
        await refreshTx.wait()
        log('refreshRevenue done')

        return {
            memberWallet,
            member2Wallet,
            dataUnion
        }
    }

    it('transfer earnings to another member within data union', async () => {
        const {
            memberWallet,
            member2Wallet,
            dataUnion
        } = await setupTest(1)

        const memberClient = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: memberWallet.privateKey,
            },
        })
        const memberDataUnion = memberClient.getDataUnion(dataUnion.getAddress())

        const statsBefore = await dataUnion.getMemberStats(memberWallet.address)
        const stats2Before = await dataUnion.getMemberStats(member2Wallet.address)
        log('Stats before: %O, %O', statsBefore, stats2Before)

        log('%s sidechain-ETH balance: %s', memberWallet.address, await providerSidechain.getBalance(memberWallet.address))
        log('%s sidechain-DATA balance: %s', memberWallet.address, await tokenSidechain.balanceOf(memberWallet.address))

        log('Transfer 1 token worth of earnings with transferWithinContract: %s -> %s', memberWallet.address, member2Wallet.address)
        await memberDataUnion.transferWithinContract(member2Wallet.address, parseEther('1'))

        const statsAfter = await dataUnion.getMemberStats(memberWallet.address)
        const stats2After = await dataUnion.getMemberStats(member2Wallet.address)
        log('Stats after: %O, %O', statsAfter, stats2After)

        // 1 token is withdrawn from sender's earnings
        expect(formatEther(statsBefore.totalEarnings)).toEqual('2.0')
        expect(formatEther(statsBefore.withdrawableEarnings)).toEqual('2.0')
        expect(formatEther(statsAfter.totalEarnings)).toEqual('2.0')
        expect(formatEther(statsAfter.withdrawableEarnings)).toEqual('1.0')

        // 1 token is added to recipient's earnings
        expect(formatEther(stats2Before.totalEarnings)).toEqual('2.0')
        expect(formatEther(stats2Before.withdrawableEarnings)).toEqual('2.0')
        expect(formatEther(stats2After.totalEarnings)).toEqual('3.0')
        expect(formatEther(stats2After.withdrawableEarnings)).toEqual('3.0')
    }, 1500000)

    it.each([true, false])('transfer token from outside to member earnings, approveFirst=%p', async (approveFirst: boolean) => {
        const {
            memberWallet,
            member2Wallet,
            dataUnion
        } = await setupTest(2)
        const adminWalletSidechain = getSidechainTestWallet(2)

        const statsBefore = await dataUnion.getMemberStats(memberWallet.address)
        const stats2Before = await dataUnion.getMemberStats(member2Wallet.address)
        log('Stats before: %O, %O', statsBefore, stats2Before)

        // if approval hasn't been done, transferToMemberInContract should do it
        if (approveFirst) {
            const approve = await tokenSidechain.approve(dataUnion.getSidechainAddress(), parseEther('1'))
            await approve.wait()
            log(`Approve DU ${dataUnion.getSidechainAddress()} to access 1 token from ${adminWalletSidechain.address}`)
        }

        log(`Transfer 1 token with transferToMemberInContract to ${memberWallet.address}`)
        await dataUnion.transferToMemberInContract(memberWallet.address, parseEther('1'))

        const statsAfter = await dataUnion.getMemberStats(memberWallet.address)
        const stats2After = await dataUnion.getMemberStats(member2Wallet.address)
        log('Stats after: %O, %O', statsAfter, stats2After)

        // 1 token is added to recipient's earnings
        expect(formatEther(statsBefore.totalEarnings)).toEqual('2.0')
        expect(formatEther(statsBefore.withdrawableEarnings)).toEqual('2.0')
        expect(formatEther(statsAfter.totalEarnings)).toEqual('3.0')
        expect(formatEther(statsAfter.withdrawableEarnings)).toEqual('3.0')

        // other members remain unaffected
        expect(formatEther(stats2Before.totalEarnings)).toEqual('2.0')
        expect(formatEther(stats2Before.withdrawableEarnings)).toEqual('2.0')
        expect(formatEther(stats2After.totalEarnings)).toEqual('2.0')
        expect(formatEther(stats2After.withdrawableEarnings)).toEqual('2.0')
    }, 1500000)
})
