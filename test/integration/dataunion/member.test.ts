import { providers, Wallet } from 'ethers'
import debug from 'debug'

import { StreamrClient } from '../../../src/StreamrClient'
import { clientOptions } from '../devEnvironment'
import { DataUnion, JoinRequestState } from '../../../src/dataunion/DataUnion'
import { createMockAddress, expectInvalidAddress, fakePrivateKey } from '../../utils'
import authFetch from '../../../src/rest/authFetch'
import { getEndpointUrl } from '../../../src/utils'

const log = debug('StreamrClient::DataUnion::integration-test-member')

const providerSidechain = new providers.JsonRpcProvider(clientOptions.sidechain)
const providerMainnet = new providers.JsonRpcProvider(clientOptions.mainnet)

const joinMember = async (memberWallet: Wallet, secret: string|undefined, dataUnionAddress: string) => {
    const memberClient = new StreamrClient({
        ...clientOptions,
        auth: {
            privateKey: memberWallet.privateKey,
        }
    } as any)
    const du = await memberClient.safeGetDataUnion(dataUnionAddress)
    return du.join(secret)
}

describe('DataUnion member', () => {

    let dataUnion: DataUnion
    let secret: string

    beforeAll(async () => {
        log('Connecting to Ethereum networks, clientOptions: %O', clientOptions)
        const network = await providerMainnet.getNetwork()
        log('Connected to "mainnet" network: ', JSON.stringify(network))
        const network2 = await providerSidechain.getNetwork()
        log('Connected to sidechain network: ', JSON.stringify(network2))
        const adminClient = new StreamrClient(clientOptions as any)
        dataUnion = await adminClient.deployDataUnion()
        // product is needed for join requests to analyze the DU version
        const createProductUrl = getEndpointUrl(clientOptions.restUrl, 'products')
        await authFetch(
            createProductUrl,
            adminClient.session,
            {
                method: 'POST',
                body: JSON.stringify({
                    beneficiaryAddress: dataUnion.getAddress(),
                    type: 'DATAUNION',
                    dataUnionVersion: 2
                })
            }
        )
        secret = await dataUnion.createSecret()
    }, 60000)

    afterAll(() => {
        providerMainnet.removeAllListeners()
        providerSidechain.removeAllListeners()
    })

    it('random user is not a member', async () => {
        const userAddress = createMockAddress()
        const isMember = await dataUnion.isMember(userAddress)
        expect(isMember).toBe(false)
    }, 60000)

    it('join with valid secret', async () => {
        const memberWallet = new Wallet(fakePrivateKey())
        await joinMember(memberWallet, secret, dataUnion.getAddress())
        const isMember = await dataUnion.isMember(memberWallet.address)
        expect(isMember).toBe(true)
    }, 60000)

    it('join with invalid secret', async () => {
        const memberWallet = new Wallet(fakePrivateKey())
        return expect(() => joinMember(memberWallet, 'invalid-secret', dataUnion.getAddress())).rejects.toThrow('Incorrect data union secret')
    }, 60000)

    it('join without secret', async () => {
        const memberWallet = new Wallet(fakePrivateKey())
        const response = await joinMember(memberWallet, undefined, dataUnion.getAddress())
        expect(response.id).toBeDefined()
        expect(response.state).toBe(JoinRequestState.PENDING)
    }, 60000)

    it('add', async () => {
        const userAddress = createMockAddress()
        await dataUnion.addMembers([userAddress])
        const isMember = await dataUnion.isMember(userAddress)
        expect(isMember).toBe(true)
    }, 60000)

    it('remove', async () => {
        const userAddress = createMockAddress()
        await dataUnion.addMembers([userAddress])
        await dataUnion.removeMembers([userAddress])
        const isMember = await dataUnion.isMember(userAddress)
        expect(isMember).toBe(false)
    }, 60000)

    it('invalid address', () => {
        return Promise.all([
            expectInvalidAddress(() => dataUnion.addMembers(['invalid-address'])),
            expectInvalidAddress(() => dataUnion.removeMembers(['invalid-address'])),
            expectInvalidAddress(() => dataUnion.isMember('invalid-address'))
        ])
    })
})
