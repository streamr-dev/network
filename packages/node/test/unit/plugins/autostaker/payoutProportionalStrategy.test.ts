import { adjustStakes } from '../../../../src/plugins/autostaker/payoutProportionalStrategy'

describe('payoutProportionalStrategy', () => {

    it('stake all', () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 11000n, stakes: new Map() },
            operatorConfig: { },
            stakeableSponsorships: new Map([
                ['a', { totalPayoutWeiPerSec: 2n }],
                ['b', { totalPayoutWeiPerSec: 4n }],
                ['c', { totalPayoutWeiPerSec: 6n }],
            ]),
            environmentConfig: { minimumStakeWei: 5000n },
        })).toIncludeSameMembers([
            { type: 'stake', sponsorshipId: 'b', amount: 5400n },
            { type: 'stake', sponsorshipId: 'c', amount: 5600n }
        ])  
    })

    it('unstakes everything if no stakeable sponsorships', async () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 1000n, stakes: new Map([[ 'a', 2000n ]]) },
            operatorConfig: { },
            stakeableSponsorships: new Map(),
            environmentConfig: { minimumStakeWei: 1234n },
        })).toEqual([
            { type: 'unstake', sponsorshipId: 'a', amount: 2000n },
        ])
    })

    it('limits the targetSponsorshipCount to stakeableSponsorships.size', async () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 600n, stakes: new Map() },
            operatorConfig: { },
            stakeableSponsorships: new Map([
                ['a', { totalPayoutWeiPerSec: 10n }],
                ['b', { totalPayoutWeiPerSec: 20n }],
                ['c', { totalPayoutWeiPerSec: 30n }],
            ]),
            environmentConfig: { minimumStakeWei: 0n },
        }).sort((a, b) => a.sponsorshipId.localeCompare(b.sponsorshipId))).toEqual([
            { type: 'stake', sponsorshipId: 'a', amount: 100n },
            { type: 'stake', sponsorshipId: 'b', amount: 200n },
            { type: 'stake', sponsorshipId: 'c', amount: 300n },
        ])
    })

    it('limits the targetSponsorshipCount to maxSponsorshipCount', async () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 500n, stakes: new Map() },
            operatorConfig: { maxSponsorshipCount: 2 },
            stakeableSponsorships: new Map([
                ['a', { totalPayoutWeiPerSec: 10n }], // not included
                ['b', { totalPayoutWeiPerSec: 20n }], // included
                ['c', { totalPayoutWeiPerSec: 30n }], // included
            ]),
            environmentConfig: { minimumStakeWei: 0n },
        }).sort((a, b) => a.sponsorshipId.localeCompare(b.sponsorshipId))).toEqual([
            { type: 'stake', sponsorshipId: 'b', amount: 200n },
            { type: 'stake', sponsorshipId: 'c', amount: 300n },
        ])
    })

    it('limits the targetSponsorshipCount to minimumStakeWei and available tokens', async () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 500n, stakes: new Map() },
            operatorConfig: { },
            stakeableSponsorships: new Map([
                ['a', { totalPayoutWeiPerSec: 10n }], // not included
                ['b', { totalPayoutWeiPerSec: 20n }], // not included
                ['c', { totalPayoutWeiPerSec: 30n }], // included
            ]),
            environmentConfig: { minimumStakeWei: 300n },
        }).sort((a, b) => a.sponsorshipId.localeCompare(b.sponsorshipId))).toEqual([
            { type: 'stake', sponsorshipId: 'c', amount: 500n },
        ])
    })

    it('doesn\'t allocate tokens if less available than minimum stake', async () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 100n, stakes: new Map() },
            operatorConfig: { },
            stakeableSponsorships: new Map([['a', { totalPayoutWeiPerSec: 10n }]]),
            environmentConfig: { minimumStakeWei: 300n },
        })).toEqual([])
    })

    // unstakes must happen first because otherwise there isn't enough tokens for staking
    it('sends out unstakes before stakes', async () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 0n, stakes: new Map([
                [ 'a', 30n ],
                [ 'b', 70n ],
            ]) },
            operatorConfig: { },
            stakeableSponsorships: new Map([
                ['a', { totalPayoutWeiPerSec: 40n }], // add stake here
                ['b', { totalPayoutWeiPerSec: 30n }], // unstake from here
                ['c', { totalPayoutWeiPerSec: 20n }], // stake here
                ['d', { totalPayoutWeiPerSec: 10n }], // stake here
            ]),
            environmentConfig: { minimumStakeWei: 0n },
        }).map((a) => a.type)).toEqual([
            'unstake',
            'stake',
            'stake',
            'stake',
        ])
    })

    it('unstakes from expired sponsorships', async () => {
        // currently staked into b, but b has expired, so it's not included in the stakeableSponsorships
        expect(adjustStakes({
            operatorState: { unstakedWei: 0n, stakes: new Map([[ 'b', 100n ]]) },
            operatorConfig: { },
            stakeableSponsorships: new Map([
                ['a', { totalPayoutWeiPerSec: 10n }],
            ]),
            environmentConfig: { minimumStakeWei: 0n },
        })).toIncludeSameMembers([
            { type: 'unstake', sponsorshipId: 'b', amount: 100n },
            { type: 'stake', sponsorshipId: 'a', amount: 100n },
        ])
    })

    it('restakes expired sponsorship stakes into other sponsorships', async () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 0n, stakes: new Map([
                [ 'a', 100n ],
                [ 'b', 100n ],
                [ 'c', 100n ],
            ]) },
            operatorConfig: { },
            stakeableSponsorships: new Map([
                ['a', { totalPayoutWeiPerSec: 10n }],
                ['b', { totalPayoutWeiPerSec: 10n }],
            ]),
            environmentConfig: { minimumStakeWei: 0n },
        })).toIncludeSameMembers([
            { type: 'unstake', sponsorshipId: 'c', amount: 100n },
            { type: 'stake', sponsorshipId: 'a', amount: 50n },
            { type: 'stake', sponsorshipId: 'b', amount: 50n },
        ])
    })

    it('handles rounding errors', async () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 1000n, stakes: new Map() },
            operatorConfig: { },
            stakeableSponsorships: new Map([
                ['a', { totalPayoutWeiPerSec: 100n }],
                ['b', { totalPayoutWeiPerSec: 100n }],
                ['c', { totalPayoutWeiPerSec: 400n }],
            ]),
            environmentConfig: { minimumStakeWei: 0n },
        })).toIncludeSameMembers([
            { type: 'stake', sponsorshipId: 'a', amount: 166n },
            { type: 'stake', sponsorshipId: 'b', amount: 166n },
            { type: 'stake', sponsorshipId: 'c', amount: 668n },
        ])
    })

    it('rounding error no-op case', async () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 0n, stakes: new Map([
                ['a', 166n ],
                ['b', 166n ],
                ['c', 668n ],
            ]) },
            operatorConfig: { },
            stakeableSponsorships: new Map([
                ['a', { totalPayoutWeiPerSec: 100n }],
                ['b', { totalPayoutWeiPerSec: 100n }],
                ['c', { totalPayoutWeiPerSec: 400n }],
            ]),
            environmentConfig: { minimumStakeWei: 0n },
        })).toEqual([])
    })

    it('uses Infinity as default maxSponsorshipCount', async () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 1000n, stakes: new Map() },
            operatorConfig: { },
            stakeableSponsorships: new Map([
                ['a', { totalPayoutWeiPerSec: 10n }],
                ['b', { totalPayoutWeiPerSec: 20n }],
                ['c', { totalPayoutWeiPerSec: 30n }],
                ['d', { totalPayoutWeiPerSec: 40n }],
            ]),
            environmentConfig: { minimumStakeWei: 0n },
        })).toHaveLength(4)
    })
})
