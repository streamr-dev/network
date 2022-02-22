import { BigNumber, Contract, Wallet } from 'ethers'
import { parseEther } from 'ethers/lib/utils'
import debug from 'debug'

import { getEndpointUrl } from '../../../src/utils'
import { StreamrClient } from '../../../src/StreamrClient'
import Contracts from '../../../src/dataunion/Contracts'
import DataUnionAPI from '../../../src/dataunion'
import * as Token from '../../../contracts/TestToken.json'
import * as DataUnionSidechain from '../../../contracts/DataUnionSidechain.json'
import { clientOptions, providerSidechain } from '../devEnvironment'
import authFetch from '../../../src/authFetch'
import BrubeckConfig from '../../../src/Config'
import { DataUnion } from '../../../src'

const log = debug('StreamrClient::DataUnion::integration-test-signature')

const adminWalletSidechain = new Wallet(clientOptions.auth.privateKey, providerSidechain)

describe('DataUnion signature', () => {

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
        const memberDataUnion = await memberClient.getDataUnion(dataUnionAddress)

        // product is needed for join requests to analyze the DU version
        const createProductUrl = getEndpointUrl(clientOptions.restUrl, 'products')
        await authFetch(createProductUrl, {
            method: 'POST',
            body: JSON.stringify({
                beneficiaryAddress: dataUnionAddress,
                type: 'DATAUNION',
                dataUnionVersion: 2
            }),
            // @ts-expect-error
            session: adminClient.session,
        })
        await memberDataUnion.join(secret)

        const contracts = new Contracts(new DataUnionAPI(adminClient, null!, BrubeckConfig(clientOptions)))
        const contractMainnet = await contracts.getMainnetContract(dataUnion.getAddress())
        const sidechainContractLimited = await contracts.getSidechainContract(dataUnion.getAddress())
        const tokenSidechainAddress = await contractMainnet.tokenSidechain()
        const tokenSidechain = new Contract(tokenSidechainAddress, Token.abi, adminWalletSidechain)

        // make a "full" sidechain contract object that has all functions, not just those required by StreamrClient
        const sidechainContract = new Contract(sidechainContractLimited.address, DataUnionSidechain.abi, adminWalletSidechain)

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
        const dataUnion = new DataUnion(
            '0x2222222222222222222222222222222222222222',
            '0x2222222222222222222222222222222222222222',
            new DataUnionAPI(client, null!, BrubeckConfig(clientOptions))
        )
        const to = '0x3333333333333333333333333333333333333333'
        const withdrawn = BigNumber.from('4000000000000000')
        const amounts = [5000000000000000, '5000000000000000', BigNumber.from('5000000000000000')]
        // @ts-expect-error
        const signer = client.ethereum.getSigner()
        // eslint-disable-next-line no-underscore-dangle
        const signaturePromises = amounts.map((amount) => dataUnion._createWithdrawSignature(amount, to, withdrawn, signer))
        const actualSignatures = await Promise.all(signaturePromises)
        const expectedSignature = '0xcaec648e19b71df9e14ae7c313c7a2b268356648bcfd5c5a0e82a76865d1e4a500890d71e7aa6e2dbf961251329b4528915036f1c484db8ee4ce585fd7cb05531c' // eslint-disable-line max-len
        expect(actualSignatures.every((actual) => actual === expectedSignature))
    })
})
