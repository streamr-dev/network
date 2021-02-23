import { providers, Wallet } from 'ethers'
import debug from 'debug'

import StreamrClient from '../../../src/StreamrClient'
import config from '../config'

const log = debug('StreamrClient::DataUnionEndpoints::integration-test-calculate')
// const { log } = console

// @ts-expect-error
const providerSidechain = new providers.JsonRpcProvider(config.clientOptions.sidechain)
// @ts-expect-error
const providerMainnet = new providers.JsonRpcProvider(config.clientOptions.mainnet)
const adminWalletMainnet = new Wallet(config.clientOptions.auth.privateKey, providerMainnet)

// This test will fail when new docker images are pushed with updated DU smart contracts
// -> generate new codehashes for getDataUnionMainnetAddress() and getDataUnionSidechainAddress()

it('DataUnionEndPoints: calculate DU address before deployment', async () => {
    log(`Connecting to Ethereum networks, config = ${JSON.stringify(config)}`)
    const network = await providerMainnet.getNetwork()
    log('Connected to "mainnet" network: ', JSON.stringify(network))
    const network2 = await providerSidechain.getNetwork()
    log('Connected to sidechain network: ', JSON.stringify(network2))

    const adminClient = new StreamrClient(config.clientOptions as any)
    await adminClient.ensureConnected()

    const dataUnionName = 'test-' + Date.now()
    // eslint-disable-next-line no-underscore-dangle
    const dataUnionPredicted = adminClient._getDataUnionFromName({ dataUnionName, deployerAddress: adminWalletMainnet.address })

    const dataUnionDeployed = await adminClient.deployDataUnion({ dataUnionName })
    const version = await dataUnionDeployed.getVersion()

    await providerMainnet.removeAllListeners()
    await providerSidechain.removeAllListeners()
    await adminClient.ensureDisconnected()

    expect(dataUnionPredicted.getAddress()).toBe(dataUnionDeployed.getAddress())
    expect(dataUnionPredicted.getSidechainAddress()).toBe(dataUnionDeployed.getSidechainAddress())
    expect(version).toBe(2)
}, 60000)
