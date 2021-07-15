import { utils, Wallet } from 'ethers'
import debug from 'debug'

import { StreamrClient } from '../../../src/StreamrClient'
import { clientOptions, getSidechainTestWallet, tokenAdminWalletSidechain } from '../devEnvironment'
import { DataUnion, JoinRequestState } from '../../../src/dataunion/DataUnion'
import { createMockAddress, expectInvalidAddress, fakePrivateKey } from '../../utils'
import authFetch from '../../../src/rest/authFetch'
import { getEndpointUrl } from '../../../src/utils'

const { parseEther } = utils

const log = debug('StreamrClient::DataUnion::integration-test-member')

describe('DataUnion member', () => {

    let dataUnion: DataUnion
    let secret: string

    beforeAll(async () => {
        log('clientOptions: %O', clientOptions)
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

        // TODO: this should be unnecessary after test wallets are properly set up in smart-contracts-init
        // send some ETH to a test wallet
        const memberWallet = getSidechainTestWallet(3)
        const sendTx = await tokenAdminWalletSidechain.sendTransaction({
            to: memberWallet.address,
            value: parseEther('1')
        })
        await sendTx.wait()

    }, 60000)

    async function getMemberDuObject(memberWallet: Wallet): Promise<DataUnion> {
        const memberClient = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: memberWallet.privateKey,
            }
        } as any)
        return memberClient.safeGetDataUnion(dataUnion.getAddress())
    }

    it('random user is not a member', async () => {
        const userAddress = createMockAddress()
        const isMember = await dataUnion.isMember(userAddress)
        expect(isMember).toBe(false)
    }, 60000)

    it('join with valid secret', async () => {
        const memberWallet = new Wallet(fakePrivateKey())
        const memberDu = await getMemberDuObject(memberWallet)
        await memberDu.join(secret)
        const isMember = await dataUnion.isMember(memberWallet.address)
        expect(isMember).toBe(true)
    }, 60000)

    it('part after joining', async () => {
        const memberWallet = getSidechainTestWallet(3)
        const memberDu = await getMemberDuObject(memberWallet)
        await memberDu.join(secret)

        const isMemberBefore = await dataUnion.isMember(memberWallet.address)
        await memberDu.part()
        const isMemberAfter = await dataUnion.isMember(memberWallet.address)

        expect(isMemberBefore).toBe(true)
        expect(isMemberAfter).toBe(false)
    }, 60000)

    it('join with invalid secret', async () => {
        const memberWallet = new Wallet(fakePrivateKey())
        const memberDu = await getMemberDuObject(memberWallet)
        return expect(() => memberDu.join('invalid-secret')).rejects.toThrow('Incorrect data union secret')
    }, 60000)

    it('join without secret', async () => {
        const memberWallet = new Wallet(fakePrivateKey())
        const memberDu = await getMemberDuObject(memberWallet)
        const response = await memberDu.join()
        expect(response.id).toBeDefined()
        expect(response.state).toBe(JoinRequestState.PENDING)
    }, 60000)

    it('admin add', async () => {
        const userAddress = createMockAddress()
        await dataUnion.addMembers([userAddress])
        const isMember = await dataUnion.isMember(userAddress)
        expect(isMember).toBe(true)
    }, 60000)

    it('admin remove', async () => {
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
