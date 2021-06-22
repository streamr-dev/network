import debug from 'debug'

import { StreamrClient } from '../../../src/StreamrClient'
import { clientOptions } from '../devEnvironment'
import { DataUnion, MemberStatus } from '../../../src/dataunion/DataUnion'
import { getRandomClient, createMockAddress, expectInvalidAddress } from '../../utils'
import { BigNumber } from '@ethersproject/bignumber'

const log = debug('StreamrClient::DataUnion::integration-test-stats')

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
        log('ClientOptions: %O', clientOptions)
        adminClient = new StreamrClient(clientOptions as any)
        dataUnion = await adminClient.deployDataUnion()
        await dataUnion.addMembers(activeMemberAddressList.concat([inactiveMember]))
        await dataUnion.removeMembers([inactiveMember])
        queryClient = getRandomClient()
    }, 60000)

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
        const memberStats = await Promise.all(
            activeMemberAddressList
                .concat([inactiveMember])
                .map((m) => queryClient.getDataUnion(dataUnion.getAddress()).getMemberStats(m))
        )

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
