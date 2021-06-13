import { BigNumber, Contract, providers, Wallet } from 'ethers'
import { parseEther } from 'ethers/lib/utils'
import debug from 'debug'

import { getEndpointUrl } from '../../../src/utils'
import { StreamrClient } from '../../../src/StreamrClient'
import * as Token from '../../../contracts/TestToken.json'
import * as DataUnionSidechain from '../../../contracts/DataUnionSidechain.json'
import config from '../config'
import authFetch from '../../../src/rest/authFetch'
import { Contracts } from '../../../src/dataunion/Contracts'

const log = debug('StreamrClient::DataUnion::binanceAdapter')

const providerSidechain = new providers.JsonRpcProvider(config.clientOptions.sidechain)
const adminWalletSidechain = new Wallet(config.clientOptions.auth.privateKey, providerSidechain)
// config representing another user
const config2 = Object.assign({}, config);
config2.clientOptions.auth.privateKey = '0xe5af7834455b7239881b85be89d905d6881dcb4751063897f12be1b0dd546bdb'
const oneAddress = "0x0000000000000000000000000000000000000001"


describe('Binance Adapter functions', () => {

    afterAll(() => {
        providerSidechain.removeAllListeners()
    })

    it('can set/get binance recipient for self', async () => {
        const adminClient = new StreamrClient(config.clientOptions as any)
        //const contracts = new Contracts(adminClient)
        await adminClient.setBinanceDepositAddress(oneAddress)
        expect(await adminClient.getBinanceDepositAddress(adminWalletSidechain.address)).toBe(oneAddress)
        expect(await adminClient.getBinanceDepositAddress(oneAddress)).toBe(undefined)
    }, 100000),

    it('can set/get binance recipient for other with signature', async () => {
        const client2 = new StreamrClient(config2.clientOptions as any)
        const client2address = await client2.getAddress()
        const sig = await client2.signSetBinanceRecipient(oneAddress)
        const adminClient = new StreamrClient(config.clientOptions as any)
        await adminClient.setBinanceDepositAddressFromSignature(client2address, oneAddress, sig)
        expect(await adminClient.getBinanceDepositAddress(client2address)).toBe(oneAddress)

    }, 100000)

    /*
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
    */
})
