/* eslint-disable no-await-in-loop */
import { Contract, Wallet } from 'ethers'
import { parseEther } from 'ethers/lib/utils'
import debug from 'debug'
import Token from '../../../contracts/TestToken.json'
import DataUnionSidechain from '../../../contracts/DataUnionSidechain.json'
import { clientOptions, tokenAdminPrivateKey, tokenMediatorAddress, relayTokensAbi, providerMainnet, providerSidechain, getMainnetTestWallet, getSidechainTestWallet } from '../devEnvironment'
import { getEndpointUrl, until } from '../../../src/utils'
import { MemberStatus } from '../../../src/dataunion/DataUnion'
import { StreamrClient } from '../../../src/StreamrClient'
import { EthereumAddress } from '../../../src/types'
import authFetch from '../../../src/rest/authFetch'

const log = debug('StreamrClient::DataUnion::integration-test-transfer')

const tokenAdminWallet = new Wallet(tokenAdminPrivateKey, providerMainnet)
const tokenMainnet = new Contract(clientOptions.tokenAddress, Token.abi, tokenAdminWallet)

const tokenAdminSidechainWallet = new Wallet(tokenAdminPrivateKey, providerSidechain)
const tokenSidechain = new Contract(clientOptions.tokenSidechainAddress, Token.abi, tokenAdminSidechainWallet)

async function addMember(dataUnionAddress: EthereumAddress, secret: string) {
    const memberWallet = new Wallet(`0x100000000000000000000000000000000000000012300000001${Date.now()}`, providerSidechain)
    const memberClient = new StreamrClient({
        ...clientOptions,
        auth: {
            privateKey: memberWallet.privateKey
        }
    } as any)
    const memberDataUnion = memberClient.getDataUnion(dataUnionAddress) // TODO: await safeGetDataUnion
    const res = await memberDataUnion.join(secret)
    log(`Member joined data union: ${JSON.stringify(res)}`)
    return memberWallet
}

describe('DataUnion earnings transfer methods', () => {
    beforeAll(async () => {
        log('Connecting to Ethereum networks, clientOptions: %o', clientOptions)
        const network = await providerMainnet.getNetwork()
        log('Connected to "mainnet" network: %o', network)
        const network2 = await providerSidechain.getNetwork()
        log('Connected to sidechain network: %o', network2)

        // TODO: all of the below should happen in smart-contracts-init?

        log('Minting 200 tokens to %s and sending 100 to sidechain', tokenAdminWallet.address)
        const mintTx = await tokenMainnet.mint(tokenAdminWallet.address, parseEther('200'))
        await mintTx.wait()
        const tokenMediator = new Contract(tokenMediatorAddress, relayTokensAbi, tokenAdminWallet)
        const approveTx = await tokenMainnet.approve(tokenMediator.address, parseEther('100'))
        await approveTx.wait()
        const relayTx = await tokenMediator.relayTokensAndCall(tokenMainnet.address, tokenAdminWallet.address, parseEther('100'), '0x1234') // dummy 0x1234
        await relayTx.wait()
        await until(async () => (await tokenSidechain.balanceOf(tokenAdminWallet.address)).gt('0'), 300000, 3000)

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

        log('Distributing 10 sidechain DATA to following addresses:')
        for (let i = 1; i <= 2; i++) {
            const testWallet = getSidechainTestWallet(i)
            log('    #%d: %s', i, testWallet.address)
            const sendTx = await tokenSidechain.transfer(testWallet.address, parseEther('10'))
            await sendTx.wait()
        }
    }, 150000)

    afterAll(() => {
        providerMainnet.removeAllListeners()
        providerSidechain.removeAllListeners()
    })

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

        const transferTx = await tokenSidechain.transfer(dataUnionSidechain.address, parseEther('4'))
        await transferTx.wait()

        const refreshTx = await dataUnionSidechain.refreshRevenue()
        await refreshTx.wait()

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

        const statsBefore = await dataUnion.getMemberStats(memberWallet.address)
        const stats2Before = await dataUnion.getMemberStats(member2Wallet.address)
        log('Stats: %o, %o', statsBefore, stats2Before)

        await dataUnion.transferWithinContract(member2Wallet.address, parseEther('1'))
        log(`Transfer 1 token worth of earnings with transferWithinContract: ${memberWallet.address} -> ${member2Wallet.address}`)

        const statsAfter = await dataUnion.getMemberStats(memberWallet.address)
        const stats2After = await dataUnion.getMemberStats(member2Wallet.address)
        log('Stats: %o, %o', statsAfter, stats2After)

        expect(statsBefore).toMatchObject({
            status: MemberStatus.ACTIVE,
            earningsBeforeLastJoin: parseEther('0'),
            totalEarnings: parseEther('2'),
            withdrawableEarnings: parseEther('2'),
        })
        expect(statsAfter).toMatchObject({
            status: MemberStatus.ACTIVE,
            earningsBeforeLastJoin: parseEther('0'),
            totalEarnings: parseEther('3'),
            withdrawableEarnings: parseEther('3'),
        })
        expect(stats2Before).toMatchObject({
            status: MemberStatus.ACTIVE,
            earningsBeforeLastJoin: parseEther('0'),
            totalEarnings: parseEther('2'),
            withdrawableEarnings: parseEther('2'),
        })
        expect(stats2After).toMatchObject({
            status: MemberStatus.ACTIVE,
            earningsBeforeLastJoin: parseEther('0'),
            totalEarnings: parseEther('2'),
            withdrawableEarnings: parseEther('1'),
        })
    }, 1500000)

    it('transfer token from outside to member earnings', async () => {
        const {
            memberWallet,
            member2Wallet,
            dataUnion
        } = await setupTest(2)

        const statsBefore = await dataUnion.getMemberStats(memberWallet.address)
        const stats2Before = await dataUnion.getMemberStats(member2Wallet.address)
        log('Stats: %o, %o', statsBefore, stats2Before)

        const adminWalletSidechain = getSidechainTestWallet(2)
        const approve = await tokenSidechain.connect(adminWalletSidechain).approve(dataUnion.getSidechainAddress(), parseEther('1'))
        await approve.wait()
        log(`Approve DU ${dataUnion.getSidechainAddress()} to access 1 token from ${adminWalletSidechain.address}`)

        await dataUnion.transferToMemberInContract(memberWallet.address, parseEther('1'))
        log(`Transfer 1 token with transferWithinContract to ${memberWallet.address}`)

        const statsAfter = await dataUnion.getMemberStats(memberWallet.address)
        const stats2After = await dataUnion.getMemberStats(member2Wallet.address)
        log('Stats: %o, %o', statsAfter, stats2After)

        expect(statsBefore).toMatchObject({
            status: MemberStatus.ACTIVE,
            earningsBeforeLastJoin: parseEther('0'),
            totalEarnings: parseEther('2'),
            withdrawableEarnings: parseEther('2'),
        })
        expect(statsAfter).toMatchObject({
            status: MemberStatus.ACTIVE,
            earningsBeforeLastJoin: parseEther('0'),
            totalEarnings: parseEther('3'),
            withdrawableEarnings: parseEther('3'),
        })
        expect(stats2Before).toMatchObject({
            status: MemberStatus.ACTIVE,
            earningsBeforeLastJoin: parseEther('0'),
            totalEarnings: parseEther('2'),
            withdrawableEarnings: parseEther('2'),
        })
        expect(stats2After).toMatchObject({
            status: MemberStatus.ACTIVE,
            earningsBeforeLastJoin: parseEther('0'),
            totalEarnings: parseEther('2'),
            withdrawableEarnings: parseEther('1'),
        })
    }, 1500000)
})
