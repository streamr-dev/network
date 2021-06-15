import { BigNumber, Contract, providers, Wallet } from 'ethers'
import { parseEther } from 'ethers/lib/utils'
import debug from 'debug'

import { getEndpointUrl } from '../../../src/utils'
import { StreamrClient } from '../../../src/StreamrClient'
import * as Token from '../../../contracts/TestToken.json'
import * as DataUnionSidechain from '../../../contracts/DataUnionSidechain.json'
import { clientOptions } from '../devEnvironment'
import authFetch from '../../../src/rest/authFetch'

const log = debug('StreamrClient::DataUnion::integration-test-signature')

const providerSidechain = new providers.JsonRpcProvider(clientOptions.sidechain)
const adminWalletSidechain = new Wallet(clientOptions.auth.privateKey, providerSidechain)

describe('DataUnion signature', () => {

    afterAll(() => {
        providerSidechain.removeAllListeners()
    })

    it('check validity', async () => {
        const adminClient = new StreamrClient(clientOptions as any)
        const dataUnion = await adminClient.deployDataUnion()
        const dataUnionAddress = dataUnion.getAddress()
        const secret = await dataUnion.createSecret('test secret')
        log(`DataUnion ${dataUnionAddress} is ready to roll`)

        const memberWallet = new Wallet(`0x100000000000000000000000000000000000000012300000001${Date.now()}`, providerSidechain)
        const member2Wallet = new Wallet(`0x100000000000000000000000000000000000000012300000002${Date.now()}`, providerSidechain)

        const memberClient = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: memberWallet.privateKey
            }
        } as any)
        const memberDataUnion = await memberClient.safeGetDataUnion(dataUnionAddress)

        // product is needed for join requests to analyze the DU version
        const createProductUrl = getEndpointUrl(clientOptions.restUrl, 'products')
        await authFetch(createProductUrl, adminClient.session, {
            method: 'POST',
            body: JSON.stringify({
                beneficiaryAddress: dataUnionAddress,
                type: 'DATAUNION',
                dataUnionVersion: 2
            })
        })
        await memberDataUnion.join(secret)

        // eslint-disable-next-line no-underscore-dangle
        const contract = await dataUnion._getContract()
        const sidechainContract = new Contract(contract.sidechain.address, DataUnionSidechain.abi, adminWalletSidechain)
        const tokenSidechain = new Contract(clientOptions.tokenSidechainAddress, Token.abi, adminWalletSidechain)

        const signature = await memberDataUnion.signWithdrawAllTo(member2Wallet.address)
        const signature2 = await memberDataUnion.signWithdrawAmountTo(member2Wallet.address, parseEther('1'))
        const signature3 = await memberDataUnion.signWithdrawAmountTo(member2Wallet.address, 3000000000000000) // 0.003 tokens

        const isValid = await sidechainContract.signatureIsValid(memberWallet.address, member2Wallet.address, '0', signature) // '0' = all earnings
        const isValid2 = await sidechainContract.signatureIsValid(memberWallet.address, member2Wallet.address, parseEther('1'), signature2)
        const isValid3 = await sidechainContract.signatureIsValid(memberWallet.address, member2Wallet.address, '3000000000000000', signature3)
        log(`Signature for all tokens ${memberWallet.address} -> ${member2Wallet.address}: ${signature}, checked ${isValid ? 'OK' : '!!!BROKEN!!!'}`)
        log(`Signature for 1 token ${memberWallet.address} -> ${member2Wallet.address}: ${signature2}, checked ${isValid2 ? 'OK' : '!!!BROKEN!!!'}`)
        // eslint-disable-next-line max-len
        log(`Signature for 0.003 tokens ${memberWallet.address} -> ${member2Wallet.address}: ${signature3}, checked ${isValid3 ? 'OK' : '!!!BROKEN!!!'}`)
        log(`sidechainDU(${sidechainContract.address}) token bal ${await tokenSidechain.balanceOf(sidechainContract.address)}`)

        expect(isValid).toBe(true)
        expect(isValid2).toBe(true)
        expect(isValid3).toBe(true)
    }, 100000)

    it('create signature', async () => {
        const client = new StreamrClient({
            auth: {
                privateKey: '0x1111111111111111111111111111111111111111111111111111111111111111'
            }
        })
        const dataUnion = client.getDataUnion('0x2222222222222222222222222222222222222222')
        const to = '0x3333333333333333333333333333333333333333'
        const withdrawn = BigNumber.from('4000000000000000')
        const amounts = [5000000000000000, '5000000000000000', BigNumber.from('5000000000000000')]
        // eslint-disable-next-line no-underscore-dangle
        const signaturePromises = amounts.map((amount) => dataUnion._createWithdrawSignature(amount, to, withdrawn, client.ethereum.getSigner()))
        const actualSignatures = await Promise.all(signaturePromises)
        const expectedSignature = '0x5325ae62cdfd7d7c15101c611adcb159439217a48193c4e1d87ca5de698ec5233b1a68fd1302fdbd5450618d40739904295c88e88cf79d4241cf8736c2ec75731b' // eslint-disable-line max-len
        expect(actualSignatures.every((actual) => actual === expectedSignature))
    })
})
