import { Contract, providers, Wallet } from 'ethers'
import { parseEther, formatEther } from 'ethers/lib/utils'
import debug from 'debug'

import { StreamrClient } from '../../../src/StreamrClient'
import * as Token from '../../../contracts/TestToken.json'
import Contracts from '../../../src/dataunion/Contracts'
import DataUnionAPI from '../../../src/dataunion'
import { dataUnionAdminPrivateKey, tokenAdminPrivateKey } from '../devEnvironment'
import { ConfigTest } from '../../../src/ConfigTest'
import { BrubeckConfig } from '../../../src/Config'

const log = debug('StreamrClient::DataUnion::integration-test-adminFee')

const providerSidechain = new providers.JsonRpcProvider(ConfigTest.dataUnionChainRPC)
const providerMainnet = new providers.JsonRpcProvider(ConfigTest.mainChainRPC)
const adminWalletMainnet = new Wallet(dataUnionAdminPrivateKey, providerMainnet)

describe('DataUnion admin fee', () => {
    let adminClient: StreamrClient

    const tokenAdminWallet = new Wallet(tokenAdminPrivateKey, providerMainnet)
    const tokenMainnet = new Contract(ConfigTest.tokenAddress, Token.abi, tokenAdminWallet)

    beforeAll(async () => {
        log('Connecting to Ethereum networks, clientOptions: %O', ConfigTest)
        const network = await providerMainnet.getNetwork()
        log('Connected to "mainnet" network: ', JSON.stringify(network))
        const network2 = await providerSidechain.getNetwork()
        log('Connected to sidechain network: ', JSON.stringify(network2))
        log(`Minting 100 tokens to ${adminWalletMainnet.address}`)
        const tx1 = await tokenMainnet.mint(adminWalletMainnet.address, parseEther('100'))
        await tx1.wait()
        adminClient = new StreamrClient(ConfigTest)
    }, 10000)

    it('can set admin fee', async () => {
        const dataUnion = await adminClient.deployDataUnion()
        const oldFee = await dataUnion.getAdminFee()
        log(`DU owner: ${await dataUnion.getAdminAddress()}`)
        log(`Sending tx from ${await adminClient.getAddress()}`)
        const tr = await dataUnion.setAdminFee(0.1)
        log(`Transaction receipt: ${JSON.stringify(tr)}`)
        const newFee = await dataUnion.getAdminFee()
        expect(oldFee).toEqual(0)
        expect(newFee).toEqual(0.1)
    }, 150000)

    it('receives admin fees', async () => {
        const dataUnion = await adminClient.deployDataUnion()
        const tr = await dataUnion.setAdminFee(0.1)
        log(`Transaction receipt: ${JSON.stringify(tr)}`)

        const amount = parseEther('2')

        const contracts = new Contracts(new DataUnionAPI(adminClient, null!, BrubeckConfig(ConfigTest)))
        const contract = await contracts.getMainnetContract(dataUnion.getAddress())
        const tokenAddress = await contract.tokenMainnet()
        const adminTokenMainnet = new Contract(tokenAddress, Token.abi, adminWalletMainnet)

        log(`Transferring ${amount} token-wei ${adminWalletMainnet.address}->${dataUnion.getAddress()}`)
        const txTokenToDU = await adminTokenMainnet.transfer(dataUnion.getAddress(), amount)
        await txTokenToDU.wait()

        const balance1 = await adminTokenMainnet.balanceOf(adminWalletMainnet.address)
        log(`Token balance of ${adminWalletMainnet.address}: ${formatEther(balance1)} (${balance1.toString()})`)

        log(`Transferred ${formatEther(amount)} tokens, next sending to bridge`)
        const tx2 = await contract.sendTokensToBridge()
        await tx2.wait()

        const balance2 = await adminTokenMainnet.balanceOf(adminWalletMainnet.address)
        log(`Token balance of ${adminWalletMainnet.address}: ${formatEther(balance2)} (${balance2.toString()})`)

        expect(formatEther(balance2.sub(balance1))).toEqual('0.2')
    }, 150000)

})
