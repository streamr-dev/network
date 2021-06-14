import { providers, Wallet } from 'ethers'
import debug from 'debug'

import { StreamrClient } from '../../../src/StreamrClient'
import config from '../config'
import { createClient, expectInvalidAddress } from '../../utils'

const log = debug('StreamrClient::DataUnion::integration-test-calculate')

const providerSidechain = new providers.JsonRpcProvider(clientOptions.sidechain)
const providerMainnet = new providers.JsonRpcProvider(clientOptions.mainnet)
const adminWalletMainnet = new Wallet(clientOptions.auth.privateKey, providerMainnet)

// This test will fail when new docker images are pushed with updated DU smart contracts
// -> generate new codehashes for getDataUnionMainnetAddress() and getDataUnionSidechainAddress()

describe('DataUnion calculate', () => {

    afterAll(() => {
        providerMainnet.removeAllListeners()
        providerSidechain.removeAllListeners()
    })

    it('calculate DU address before deployment', async () => {
        log(`Connecting to Ethereum networks, config = ${JSON.stringify(config)}`)
        const network = await providerMainnet.getNetwork()
        log('Connected to "mainnet" network: ', JSON.stringify(network))
        const network2 = await providerSidechain.getNetwork()
        log('Connected to sidechain network: ', JSON.stringify(network2))

        const adminClient = new StreamrClient(clientOptions as any)

        const dataUnionName = 'test-' + Date.now()
        // eslint-disable-next-line no-underscore-dangle
        const dataUnionPredicted = adminClient._getDataUnionFromName({ dataUnionName, deployerAddress: adminWalletMainnet.address })

        const dataUnionDeployed = await adminClient.deployDataUnion({ dataUnionName })
        const version = await dataUnionDeployed.getVersion()

        expect(dataUnionPredicted.getAddress()).toBe(dataUnionDeployed.getAddress())
        expect(dataUnionPredicted.getSidechainAddress()).toBe(dataUnionDeployed.getSidechainAddress())
        expect(version).toBe(2)
    }, 60000)

    it('get DataUnion: invalid address', () => {
        const client = createClient(providerSidechain)
        return expectInvalidAddress(async () => client.getDataUnion('invalid-address'))
    })
})
