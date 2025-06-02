import { adjustStakes } from '../../../../src/plugins/autostaker/payoutProportionalStrategy'

describe('payoutProportionalStrategy', () => {

    it('stake all', () => {
        expect(adjustStakes({
            operatorState: { unstakedAmount: 11000n, stakes: new Map() },
            operatorConfig: { minTransactionAmount: 0n, operatorContractAddress: '' },
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 2n }],
                ['b', { payoutPerSec: 4n }],
                ['c', { payoutPerSec: 6n }],
            ]),
            environmentConfig: { minStakePerSponsorship: 5000n },
        })).toIncludeSameMembers([
            { type: 'stake', sponsorshipId: 'b', amount: 5400n },
            { type: 'stake', sponsorshipId: 'c', amount: 5600n }
        ])  
    })

    it('unstakes everything if no stakeable sponsorships', async () => {
        expect(adjustStakes({
            operatorState: { unstakedAmount: 1000n, stakes: new Map([[ 'a', 2000n ]]) },
            operatorConfig: { minTransactionAmount: 0n, operatorContractAddress: '' },
            stakeableSponsorships: new Map(),
            environmentConfig: { minStakePerSponsorship: 1234n },
        })).toEqual([
            { type: 'unstake', sponsorshipId: 'a', amount: 2000n },
        ])
    })

    it('limits the targetSponsorshipCount to stakeableSponsorships.size', async () => {
        expect(adjustStakes({
            operatorState: { unstakedAmount: 600n, stakes: new Map() },
            operatorConfig: { minTransactionAmount: 0n, operatorContractAddress: '' },
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 10n }],
                ['b', { payoutPerSec: 20n }],
                ['c', { payoutPerSec: 30n }],
            ]),
            environmentConfig: { minStakePerSponsorship: 0n },
        }).sort((a, b) => a.sponsorshipId.localeCompare(b.sponsorshipId))).toEqual([
            { type: 'stake', sponsorshipId: 'a', amount: 100n },
            { type: 'stake', sponsorshipId: 'b', amount: 200n },
            { type: 'stake', sponsorshipId: 'c', amount: 300n },
        ])
    })

    it('limits the targetSponsorshipCount to maxSponsorshipCount', async () => {
        expect(adjustStakes({
            operatorState: { unstakedAmount: 500n, stakes: new Map() },
            operatorConfig: { maxSponsorshipCount: 2, minTransactionAmount: 0n, operatorContractAddress: '' },
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 10n }], // not included
                ['b', { payoutPerSec: 20n }], // included
                ['c', { payoutPerSec: 30n }], // included
            ]),
            environmentConfig: { minStakePerSponsorship: 0n },
        }).sort((a, b) => a.sponsorshipId.localeCompare(b.sponsorshipId))).toEqual([
            { type: 'stake', sponsorshipId: 'b', amount: 200n },
            { type: 'stake', sponsorshipId: 'c', amount: 300n },
        ])
    })

    it('limits the targetSponsorshipCount to minStakePerSponsorship and available tokens', async () => {
        expect(adjustStakes({
            operatorState: { unstakedAmount: 500n, stakes: new Map() },
            operatorConfig: { minTransactionAmount: 0n, operatorContractAddress: '' },
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 10n }], // not included
                ['b', { payoutPerSec: 20n }], // not included
                ['c', { payoutPerSec: 30n }], // included
            ]),
            environmentConfig: { minStakePerSponsorship: 300n },
        }).sort((a, b) => a.sponsorshipId.localeCompare(b.sponsorshipId))).toEqual([
            { type: 'stake', sponsorshipId: 'c', amount: 500n },
        ])
    })

    it('doesn\'t allocate tokens if less available than minimum stake', async () => {
        expect(adjustStakes({
            operatorState: { unstakedAmount: 100n, stakes: new Map() },
            operatorConfig: { minTransactionAmount: 0n, operatorContractAddress: '' },
            stakeableSponsorships: new Map([['a', { payoutPerSec: 10n }]]),
            environmentConfig: { minStakePerSponsorship: 300n },
        })).toEqual([])
    })

    // unstakes must happen first because otherwise there isn't enough tokens for staking
    it('sends out unstakes before stakes', async () => {
        expect(adjustStakes({
            operatorState: { unstakedAmount: 0n, stakes: new Map([
                [ 'a', 30n ],
                [ 'b', 70n ],
            ]) },
            operatorConfig: { minTransactionAmount: 0n, operatorContractAddress: '' },
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 40n }], // add stake here
                ['b', { payoutPerSec: 30n }], // unstake from here
                ['c', { payoutPerSec: 20n }], // stake here
                ['d', { payoutPerSec: 10n }], // stake here
            ]),
            environmentConfig: { minStakePerSponsorship: 0n },
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
            operatorState: { unstakedAmount: 0n, stakes: new Map([[ 'b', 100n ]]) },
            operatorConfig: { minTransactionAmount: 0n, operatorContractAddress: '' },
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 10n }],
            ]),
            environmentConfig: { minStakePerSponsorship: 0n },
        })).toIncludeSameMembers([
            { type: 'unstake', sponsorshipId: 'b', amount: 100n },
            { type: 'stake', sponsorshipId: 'a', amount: 100n },
        ])
    })

    it('restakes expired sponsorship stakes into other sponsorships', async () => {
        expect(adjustStakes({
            operatorState: { unstakedAmount: 0n, stakes: new Map([
                [ 'a', 100n ],
                [ 'b', 100n ],
                [ 'c', 100n ],
            ]) },
            operatorConfig: { minTransactionAmount: 0n, operatorContractAddress: '' },
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 10n }],
                ['b', { payoutPerSec: 10n }],
            ]),
            environmentConfig: { minStakePerSponsorship: 0n },
        })).toIncludeSameMembers([
            { type: 'unstake', sponsorshipId: 'c', amount: 100n },
            { type: 'stake', sponsorshipId: 'a', amount: 50n },
            { type: 'stake', sponsorshipId: 'b', amount: 50n },
        ])
    })

    it('handles rounding errors', async () => {
        expect(adjustStakes({
            operatorState: { unstakedAmount: 1000n, stakes: new Map() },
            operatorConfig: { minTransactionAmount: 0n, operatorContractAddress: '' },
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 100n }],
                ['b', { payoutPerSec: 100n }],
                ['c', { payoutPerSec: 400n }],
            ]),
            environmentConfig: { minStakePerSponsorship: 0n },
        })).toIncludeSameMembers([
            { type: 'stake', sponsorshipId: 'a', amount: 166n },
            { type: 'stake', sponsorshipId: 'b', amount: 166n },
            { type: 'stake', sponsorshipId: 'c', amount: 668n },
        ])
    })

    it('rounding error no-op case', async () => {
        expect(adjustStakes({
            operatorState: { unstakedAmount: 0n, stakes: new Map([
                ['a', 166n ],
                ['b', 166n ],
                ['c', 668n ],
            ]) },
            operatorConfig: { minTransactionAmount: 0n, operatorContractAddress: '' },
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 100n }],
                ['b', { payoutPerSec: 100n }],
                ['c', { payoutPerSec: 400n }],
            ]),
            environmentConfig: { minStakePerSponsorship: 0n },
        })).toEqual([])
    })

    it('uses Infinity as default maxSponsorshipCount', async () => {
        expect(adjustStakes({
            operatorState: { unstakedAmount: 1000n, stakes: new Map() },
            operatorConfig: { minTransactionAmount: 0n, operatorContractAddress: '' },
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 10n }],
                ['b', { payoutPerSec: 20n }],
                ['c', { payoutPerSec: 30n }],
                ['d', { payoutPerSec: 40n }],
            ]),
            environmentConfig: { minStakePerSponsorship: 0n },
        })).toHaveLength(4)
    })

    it('operators may choose different sponsorships if payoutPerSec are same', () => {
        const createArgs = (operatorContractAddress: string) => {
            return {
                operatorState: { unstakedAmount: 1000n, stakes: new Map() },
                operatorConfig: { minTransactionAmount: 0n, operatorContractAddress },
                stakeableSponsorships: new Map([
                    ['a', { payoutPerSec: 100n }],
                    ['b', { payoutPerSec: 100n }],
                ]),
                environmentConfig: { minStakePerSponsorship: 1000n },
            }
        }
        const stakesForOperator1 = adjustStakes(createArgs('0x1111'))
        const stakesForOperator2 = adjustStakes(createArgs('0x2222'))
        // may be different for different operators
        expect(stakesForOperator1[0].sponsorshipId).not.toEqual(stakesForOperator2[0].sponsorshipId)
        // but is deterministic for one operator
        const stakesForOperator1_rerun = adjustStakes(createArgs('0x1111'))
        expect(stakesForOperator1[0].sponsorshipId).toEqual(stakesForOperator1_rerun[0].sponsorshipId)
    })

    describe('exclude small transactions', () => {
        it('exclude small stakings', () => {
            expect(adjustStakes({
                operatorState: { unstakedAmount: 1000n, stakes: new Map() },
                operatorConfig: { minTransactionAmount: 20n, operatorContractAddress: '' },
                stakeableSponsorships: new Map([
                    ['a', { payoutPerSec: 10n }],
                    ['b', { payoutPerSec: 20n }],
                    ['c', { payoutPerSec: 1000n }]
                ]),
                environmentConfig: { minStakePerSponsorship: 0n },
            })).toIncludeSameMembers([
                { type: 'stake', sponsorshipId: 'c', amount: 972n }
            ])
        })

        it('one small transaction is balanced by removing one staking', () => {
            expect(adjustStakes({
                operatorState: { unstakedAmount: 820n, stakes: new Map([
                    ['a', 180n]
                ]) },
                operatorConfig: { minTransactionAmount: 20n, operatorContractAddress: '' },
                stakeableSponsorships: new Map([
                    ['a', { payoutPerSec: 100n }],
                    ['b', { payoutPerSec: 100n }],
                    ['c', { payoutPerSec: 400n }],
                ]),
                environmentConfig: { minStakePerSponsorship: 0n }
            })).toIncludeSameMembers([
                { type: 'stake', sponsorshipId: 'c', amount: 668n }
            ])
        })

        it('multiple small transactions are balanced with by removing multiple stakings', () => {
            expect(adjustStakes({
                operatorState: { unstakedAmount: 740n, stakes: new Map([
                    ['a', 180n],
                    ['b', 200n],
                    ['c', 295n]
                ]) },
                operatorConfig: { minTransactionAmount: 50n, operatorContractAddress: '' },
                stakeableSponsorships: new Map([
                    ['a', { payoutPerSec: 100n }],
                    ['b', { payoutPerSec: 100n }],
                    ['c', { payoutPerSec: 210n }],
                    ['d', { payoutPerSec: 220n }],
                    ['e', { payoutPerSec: 230n }]
                ]),
                environmentConfig: { minStakePerSponsorship: 0n }
            })).toIncludeSameMembers([
                { type: 'stake', sponsorshipId: 'e', amount: 381n }
            ])
        })

        it('multiple small transactions are balanced with by removing all stakings', () => {
            expect(adjustStakes({
                operatorState: { unstakedAmount: 359n, stakes: new Map([
                    ['a', 180n],
                    ['b', 200n],
                    ['c', 295n],
                    ['e', 381n]
                ]) },
                operatorConfig: { minTransactionAmount: 50n, operatorContractAddress: '' },
                stakeableSponsorships: new Map([
                    ['a', { payoutPerSec: 100n }],
                    ['b', { payoutPerSec: 100n }],
                    ['c', { payoutPerSec: 210n }],
                    ['d', { payoutPerSec: 220n }],
                    ['e', { payoutPerSec: 230n }]
                ]),
                environmentConfig: { minStakePerSponsorship: 0n }
            })).toEqual([])
        })
    })
})
