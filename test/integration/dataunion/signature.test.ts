import { Contract, providers, Wallet } from 'ethers'
import { parseEther } from 'ethers/lib/utils'
import debug from 'debug'

import { getEndpointUrl } from '../../../src/utils'
import { StreamrClient } from '../../../src/StreamrClient'
import * as Token from '../../../contracts/TestToken.json'
import * as DataUnionSidechain from '../../../contracts/DataUnionSidechain.json'
import config from '../config'
import authFetch from '../../../src/rest/authFetch'

const log = debug('StreamrClient::DataUnion::integration-test-signature')

// @ts-expect-error
const providerSidechain = new providers.JsonRpcProvider(config.clientOptions.sidechain)
const adminWalletSidechain = new Wallet(config.clientOptions.auth.privateKey, providerSidechain)

describe('DataUnion signature', () => {

    afterAll(() => {
        providerSidechain.removeAllListeners()
    })

    it('check validity', async () => {
        const adminClient = new StreamrClient(config.clientOptions as any)
        const dataUnion = await adminClient.deployDataUnion()
        const secret = await dataUnion.createSecret('test secret')
        log(`DataUnion ${dataUnion.getAddress()} is ready to roll`)

        const memberWallet = new Wallet(`0x100000000000000000000000000000000000000012300000001${Date.now()}`, providerSidechain)
        const member2Wallet = new Wallet(`0x100000000000000000000000000000000000000012300000002${Date.now()}`, providerSidechain)

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
        await memberClient.getDataUnion(dataUnion.getAddress()).join(secret)

        // eslint-disable-next-line no-underscore-dangle
        const contract = await dataUnion._getContract()
        const sidechainContract = new Contract(contract.sidechain.address, DataUnionSidechain.abi, adminWalletSidechain)
        const tokenSidechain = new Contract(config.clientOptions.tokenAddressSidechain, Token.abi, adminWalletSidechain)

        const signature = await memberClient.getDataUnion(dataUnion.getAddress()).signWithdrawAllTo(member2Wallet.address)
        const signature2 = await memberClient
            .getDataUnion(dataUnion.getAddress())
            .signWithdrawAmountTo(member2Wallet.address, parseEther('1'))
        const signature3 = await memberClient
            .getDataUnion(dataUnion.getAddress())
            .signWithdrawAmountTo(member2Wallet.address, 3000000000000000) // 0.003 tokens

        const isValid = await sidechainContract.signatureIsValid(memberWallet.address, member2Wallet.address, '0', signature) // '0' = all earnings
        const isValid2 = await sidechainContract.signatureIsValid(memberWallet.address, member2Wallet.address, parseEther('1'), signature2)
        const isValid3 = await sidechainContract.signatureIsValid(memberWallet.address, member2Wallet.address, '3000000000000000', signature3)
        log(`Signature for all tokens ${memberWallet.address} -> ${member2Wallet.address}: ${signature}, checked ${isValid ? 'OK' : '!!!BROKEN!!!'}`)
        log(`Signature for 1 token ${memberWallet.address} -> ${member2Wallet.address}: ${signature2}, checked ${isValid2 ? 'OK' : '!!!BROKEN!!!'}`)
        log(`Signature for 0.003 tokens ${memberWallet.address} -> ${member2Wallet.address}: ${signature3}, checked ${isValid3 ? 'OK' : '!!!BROKEN!!!'}`)
        log(`sidechainDU(${sidechainContract.address}) token bal ${await tokenSidechain.balanceOf(sidechainContract.address)}`)

        expect(isValid).toBe(true)
        expect(isValid2).toBe(true)
        expect(isValid3).toBe(true)
    }, 100000)

})
