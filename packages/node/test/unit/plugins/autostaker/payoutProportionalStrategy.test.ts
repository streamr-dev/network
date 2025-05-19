import { adjustStakes } from '../../../../src/plugins/autostaker/payoutProportionalStrategy'

describe('payoutProportionalStrategy', () => {
    it('unstakes everything if no stakeable sponsorships', async () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 1234n, stakes: new Map([[ 'a', 1234n ]]) },
            operatorConfig: { },
            stakeableSponsorships: new Map(),
            environmentConfig: { minimumStakeWei: 1234n },
        })).toEqual([
            { type: 'unstake', sponsorshipId: 'a', amount: 1234n },
        ])
    })

    it('limits the targetSponsorshipCount to stakeableSponsorships.size', async () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 600n, stakes: new Map() },
            operatorConfig: { },
            stakeableSponsorships: new Map([
                ['a', { totalPayoutWeiPerSec: 10n, totalStakedWei: 0n }],
                ['b', { totalPayoutWeiPerSec: 20n, totalStakedWei: 0n }],
                ['c', { totalPayoutWeiPerSec: 30n, totalStakedWei: 0n }],
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
                ['a', { totalPayoutWeiPerSec: 10n, totalStakedWei: 0n }], // not included
                ['b', { totalPayoutWeiPerSec: 20n, totalStakedWei: 0n }], // included
                ['c', { totalPayoutWeiPerSec: 30n, totalStakedWei: 0n }], // included
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
                ['a', { totalPayoutWeiPerSec: 10n, totalStakedWei: 0n }], // not included
                ['b', { totalPayoutWeiPerSec: 20n, totalStakedWei: 0n }], // not included
                ['c', { totalPayoutWeiPerSec: 30n, totalStakedWei: 0n }], // included
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
            stakeableSponsorships: new Map([['a', { totalPayoutWeiPerSec: 10n, totalStakedWei: 0n }]]),
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
                ['a', { totalPayoutWeiPerSec: 40n, totalStakedWei: 1000n }], // add stake here
                ['b', { totalPayoutWeiPerSec: 30n, totalStakedWei: 1000n }], // unstake from here
                ['c', { totalPayoutWeiPerSec: 20n, totalStakedWei: 1000n }], // stake here
                ['d', { totalPayoutWeiPerSec: 10n, totalStakedWei: 1000n }], // stake here
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
                ['a', { totalPayoutWeiPerSec: 10n, totalStakedWei: 0n }],
            ]),
            environmentConfig: { minimumStakeWei: 0n },
        })).toEqual([
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
                ['a', { totalPayoutWeiPerSec: 10n, totalStakedWei: 100n }],
                ['b', { totalPayoutWeiPerSec: 10n, totalStakedWei: 100n }],
            ]),
            environmentConfig: { minimumStakeWei: 0n },
        })).toEqual([
            { type: 'unstake', sponsorshipId: 'c', amount: 100n },
            { type: 'stake', sponsorshipId: 'a', amount: 50n },
            { type: 'stake', sponsorshipId: 'b', amount: 50n },
        ])
    })

    it('handles rounding errors by adjusting the largest staking', async () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 1000n, stakes: new Map() },
            operatorConfig: { },
            stakeableSponsorships: new Map([
                ['a', { totalPayoutWeiPerSec: 100n, totalStakedWei: 0n }],
                ['b', { totalPayoutWeiPerSec: 100n, totalStakedWei: 0n }],
                ['c', { totalPayoutWeiPerSec: 400n, totalStakedWei: 0n }],
            ]),
            environmentConfig: { minimumStakeWei: 0n },
        })).toEqual([
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
                ['a', { totalPayoutWeiPerSec: 100n, totalStakedWei: 166n }],
                ['b', { totalPayoutWeiPerSec: 100n, totalStakedWei: 166n }],
                ['c', { totalPayoutWeiPerSec: 400n, totalStakedWei: 668n }],
            ]),
            environmentConfig: { minimumStakeWei: 0n },
        })).toEqual([])
    })

    it('uses Infinity as default maxSponsorshipCount', async () => {
        expect(adjustStakes({
            operatorState: { unstakedWei: 1000n, stakes: new Map() },
            operatorConfig: { },
            stakeableSponsorships: new Map([
                ['a', { totalPayoutWeiPerSec: 10n, totalStakedWei: 0n }],
                ['b', { totalPayoutWeiPerSec: 20n, totalStakedWei: 0n }],
                ['c', { totalPayoutWeiPerSec: 30n, totalStakedWei: 0n }],
                ['d', { totalPayoutWeiPerSec: 40n, totalStakedWei: 0n }],
            ]),
            environmentConfig: { minimumStakeWei: 0n },
        })).toHaveLength(4)
    })

    describe('input validation', () => {
        it('throws if there is a sponsorship with totalPayoutWeiPerSec == 0', async () => {
            expect(() => adjustStakes({
                operatorState: { unstakedWei: 1000n, stakes: new Map() },
                operatorConfig: { },
                stakeableSponsorships: new Map([
                    ['a', { totalPayoutWeiPerSec: 123n, totalStakedWei: 0n }],
                    ['b', { totalPayoutWeiPerSec: 123n, totalStakedWei: 0n }],
                    ['c', { totalPayoutWeiPerSec: 0n, totalStakedWei: 0n }],
                    ['d', { totalPayoutWeiPerSec: 0n, totalStakedWei: 0n }],
                ]),
                environmentConfig: { minimumStakeWei: 0n },
            })).toThrow('payoutProportional: sponsorships must have positive totalPayoutWeiPerSec')
        })
        it('throws if there is a sponsorship with totalPayoutWeiPerSec < 0', async () => {
            expect(() => adjustStakes({
                operatorState: { unstakedWei: 1000n, stakes: new Map() },
                operatorConfig: { },
                stakeableSponsorships: new Map([
                    ['a', { totalPayoutWeiPerSec: 123n, totalStakedWei: 0n }],
                    ['b', { totalPayoutWeiPerSec: 123n, totalStakedWei: 0n }],
                    ['c', { totalPayoutWeiPerSec: -1n, totalStakedWei: 0n }],
                    ['d', { totalPayoutWeiPerSec: 234n, totalStakedWei: 0n }],
                ]),
                environmentConfig: { minimumStakeWei: 0n },
            })).toThrow('payoutProportional: sponsorships must have positive totalPayoutWeiPerSec')
        })
    })
})
