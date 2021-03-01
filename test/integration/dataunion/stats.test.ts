import { providers } from 'ethers'
import debug from 'debug'

import StreamrClient from '../../../src/StreamrClient'
import config from '../config'
import { DataUnion, MemberStatus } from '../../../src/dataunion/DataUnion'
import { createClient, createMockAddress, expectInvalidAddress } from '../../utils'
import { BigNumber } from '@ethersproject/bignumber'

const log = debug('StreamrClient::DataUnion::integration-test-stats')

// @ts-expect-error
const providerSidechain = new providers.JsonRpcProvider(config.clientOptions.sidechain)
// @ts-expect-error
const providerMainnet = new providers.JsonRpcProvider(config.clientOptions.mainnet)

describe('DataUnion stats', () => {

    let adminClient: StreamrClient
    let dataUnion: DataUnion
    let queryClient: StreamrClient
    const nonce = Date.now()
    const activeMemberAddressList = [
        `0x100000000000000000000000000${nonce}`,
        `0x200000000000000000000000000${nonce}`,
        `0x300000000000000000000000000${nonce}`,
    ]
    const inactiveMember = createMockAddress()

    beforeAll(async () => {
        log(`Connecting to Ethereum networks, config = ${JSON.stringify(config)}`)
        const network = await providerMainnet.getNetwork()
        log('Connected to "mainnet" network: ', JSON.stringify(network))
        const network2 = await providerSidechain.getNetwork()
        log('Connected to sidechain network: ', JSON.stringify(network2))
        adminClient = new StreamrClient(config.clientOptions as any)
        dataUnion = await adminClient.deployDataUnion()
        await dataUnion.addMembers(activeMemberAddressList.concat([inactiveMember]))
        await dataUnion.removeMembers([inactiveMember])
        queryClient = createClient(providerSidechain)
    }, 60000)

    afterAll(() => {
        providerMainnet.removeAllListeners()
        providerSidechain.removeAllListeners()
    })

    it('DataUnion stats', async () => {
        const stats = await queryClient.getDataUnion(dataUnion.getAddress()).getStats()
        expect(stats.activeMemberCount).toEqual(BigNumber.from(3))
        expect(stats.inactiveMemberCount).toEqual(BigNumber.from(1))
        expect(stats.joinPartAgentCount).toEqual(BigNumber.from(2))
        expect(stats.totalEarnings).toEqual(BigNumber.from(0))
        expect(stats.totalWithdrawable).toEqual(BigNumber.from(0))
        expect(stats.lifetimeMemberEarnings).toEqual(BigNumber.from(0))
    }, 150000)

    it('member stats', async () => {
        const memberStats = await Promise.all(activeMemberAddressList.concat([inactiveMember]).map((m) => queryClient.getDataUnion(dataUnion.getAddress()).getMemberStats(m)))
        const ZERO = BigNumber.from(0)
        expect(memberStats).toMatchObject([{
            status: MemberStatus.ACTIVE,
            earningsBeforeLastJoin: ZERO,
            totalEarnings: ZERO,
            withdrawableEarnings: ZERO,
        }, {
            status: MemberStatus.ACTIVE,
            earningsBeforeLastJoin: ZERO,
            totalEarnings: ZERO,
            withdrawableEarnings: ZERO,
        }, {
            status: MemberStatus.ACTIVE,
            earningsBeforeLastJoin: ZERO,
            totalEarnings: ZERO,
            withdrawableEarnings: ZERO,
        }, {
            status: MemberStatus.INACTIVE,
            earningsBeforeLastJoin: ZERO,
            totalEarnings: ZERO,
            withdrawableEarnings: ZERO,
        }])
    }, 150000)

    it('member stats: no member', async () => {
        const memberStats = await queryClient.getDataUnion(dataUnion.getAddress()).getMemberStats(createMockAddress())
        const ZERO = BigNumber.from(0)
        expect(memberStats).toMatchObject({
            status: MemberStatus.NONE,
            earningsBeforeLastJoin: ZERO,
            totalEarnings: ZERO,
            withdrawableEarnings: ZERO
        })
    })

    it('member stats: invalid address', () => {
        return expectInvalidAddress(() => dataUnion.getMemberStats('invalid-address'))
    })
})
