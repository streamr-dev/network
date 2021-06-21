import { providers, Wallet } from 'ethers'
import { StreamrClient } from '../../../src/StreamrClient'
import config from '../config'

// const log = debug('StreamrClient::DataUnion::binanceAdapter')
const providerSidechain = new providers.JsonRpcProvider(config.clientOptions.sidechain)
const adminWalletSidechain = new Wallet(config.clientOptions.auth.privateKey, providerSidechain)
// config representing another user
const config2 = { ...config }
config2.clientOptions.auth.privateKey = '0xe5af7834455b7239881b85be89d905d6881dcb4751063897f12be1b0dd546bdb'
const oneAddress = '0x0000000000000000000000000000000000000001'

describe('Binance Adapter functions', () => {

    afterAll(() => {
        providerSidechain.removeAllListeners()
    })

    it('can set binance recipient for self', async () => {
        const adminClient = new StreamrClient(config.clientOptions as any)
        // const contracts = new Contracts(adminClient)
        await adminClient.setBinanceDepositAddress(oneAddress)
        expect(await adminClient.getBinanceDepositAddress(adminWalletSidechain.address)).toBe(oneAddress)
        expect(await adminClient.getBinanceDepositAddress(oneAddress)).toBe(undefined)
    }, 100000)

    it('can set binance recipient for other with signature', async () => {
        const client2 = new StreamrClient(config2.clientOptions as any)
        const client2address = await client2.getAddress()
        const sig = await client2.signSetBinanceRecipient(oneAddress)
        const adminClient = new StreamrClient(config.clientOptions as any)
        await adminClient.setBinanceDepositAddressFromSignature(client2address, oneAddress, sig)
        expect(await adminClient.getBinanceDepositAddress(client2address)).toBe(oneAddress)
    }, 100000)
    /*
    // uncomment this test when withdraw server is added to CI
    ,
    it('can set binance recipient for other with signature via withdraw server', async () => {
        const client2 = new StreamrClient(config2.clientOptions as any)
        const client2address = await client2.getAddress()
        const adminClient = new StreamrClient(config.clientOptions as any)
        const sig2 = await client2.signSetBinanceRecipient(twoAddress)
        await adminClient.setBinanceDepositAddressViaWithdrawServer(client2address, twoAddress, sig2)
        expect(await adminClient.getBinanceDepositAddress(client2address)).toBe(twoAddress)
    }, 100000)
    */

})
