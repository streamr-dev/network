import { providers } from 'ethers'
import debug from 'debug'

import StreamrClient from '../../../src/StreamrClient'
import config from '../config'

const log = debug('StreamrClient::DataUnionEndpoints::integration-test-deploy')

// @ts-expect-error
const providerSidechain = new providers.JsonRpcProvider(config.clientOptions.sidechain)
// @ts-expect-error
const providerMainnet = new providers.JsonRpcProvider(config.clientOptions.mainnet)

const createMockAddress = () => '0x000000000000000000000000000' + Date.now()

describe('DataUnion deployment', () => {

    let adminClient

    beforeAll(async () => {
        log(`Connecting to Ethereum networks, config = ${JSON.stringify(config)}`)
        const network = await providerMainnet.getNetwork()
        log('Connected to "mainnet" network: ', JSON.stringify(network))
        const network2 = await providerSidechain.getNetwork()
        log('Connected to sidechain network: ', JSON.stringify(network2))
        adminClient = new StreamrClient(config.clientOptions as any)
        await adminClient.ensureConnected()
    }, 60000)

    describe('owner', () => {

        it('not specified: defaults to deployer', async () => {
            const dataUnion = await adminClient.deployDataUnion()
            expect(await dataUnion.getAdminAddress()).toBe(adminClient.getAddress())
        }, 60000)

        it('specified', async () => {
            const owner = createMockAddress()
            const dataUnion = await adminClient.deployDataUnion({ owner })
            expect(await dataUnion.getAdminAddress()).toBe(owner)
        }, 60000)

        it('invalid', () => {
            return expect(() => adminClient.deployDataUnion({ owner: 'foobar' })).rejects.toThrow('invalid address')
        }, 60000)

    })
})

