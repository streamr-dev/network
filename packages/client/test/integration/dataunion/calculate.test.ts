import { Wallet } from 'ethers'
import debug from 'debug'

import { StreamrClient } from '../../../src/StreamrClient'
import Contracts from '../../../src/dataunion/Contracts'
import DataUnionAPI from '../../../src/dataunion'
import { clientOptions, providerMainnet, providerSidechain } from '../devEnvironment'
import { getRandomClient, expectInvalidAddress } from '../../utils'
import BrubeckConfig from '../../../src/Config'

const log = debug('StreamrClient::DataUnion::integration-test-calculate')

const adminWalletMainnet = new Wallet(clientOptions.auth.privateKey, providerMainnet)

// This test will fail when new docker images are pushed with updated DU smart contracts
// -> generate new codehashes for calculateDataUnionMainnetAddress() and calculateDataUnionSidechainAddress()

describe('DataUnion calculate', () => {

    it('calculate DU address before deployment', async () => {
        log('Connecting to Ethereum networks, clientOptions: %O', clientOptions)
        const network = await providerMainnet.getNetwork()
        log('Connected to "mainnet" network: ', JSON.stringify(network))
        const network2 = await providerSidechain.getNetwork()
        log('Connected to sidechain network: ', JSON.stringify(network2))

        const adminClient = new StreamrClient(clientOptions as any)
        const dataUnionName = 'test-' + Date.now()
        const {
            mainnetAddress,
            sidechainAddress,
        } = adminClient.calculateDataUnionAddresses(dataUnionName, adminWalletMainnet.address)

        const dataUnionDeployed = await adminClient.deployDataUnion({ dataUnionName })
        const version = await dataUnionDeployed.getVersion()

        expect(dataUnionDeployed.getAddress()).toBe(mainnetAddress)
        expect(dataUnionDeployed.getSidechainAddress()).toBe(sidechainAddress)
        expect(version).toBe(2)
    }, 60000)

    it('getDataUnion fails for bad addresses', async () => {
        const client = getRandomClient()
        await expectInvalidAddress(async () => client.getDataUnion('invalid-address'))
        return expect(client.getDataUnion('0x2222222222222222222222222222222222222222'))
            .rejects
            .toThrow('0x2222222222222222222222222222222222222222 is not a Data Union!')
    })
})
