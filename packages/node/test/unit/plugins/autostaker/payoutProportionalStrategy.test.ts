import sortBy from 'lodash/sortBy'
import { adjustStakes } from '../../../../src/plugins/autostaker/payoutProportionalStrategy'

describe('payoutProportionalStrategy', () => {

    it('stake all', () => {
        expect(adjustStakes({
            myUnstakedAmount: 11000n,
            myCurrentStakes: new Map(),
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 2n }],
                ['b', { payoutPerSec: 4n }],
                ['c', { payoutPerSec: 6n }],
            ]),
            undelegationQueueAmount: 0n,
            operatorContractAddress: '',
            maxSponsorshipCount: 100,
            minTransactionAmount: 0n,
            minStakePerSponsorship: 5000n
        })).toIncludeSameMembers([
            { type: 'stake', sponsorshipId: 'b', amount: 5400n },
            { type: 'stake', sponsorshipId: 'c', amount: 5600n }
        ])
    })

    it('unstakes everything if no stakeable sponsorships', async () => {
        expect(adjustStakes({
            myUnstakedAmount: 1000n,
            myCurrentStakes: new Map([[ 'a', 2000n ]]),
            stakeableSponsorships: new Map(),
            undelegationQueueAmount: 0n,
            operatorContractAddress: '',
            maxSponsorshipCount: 100,
            minTransactionAmount: 0n,
            minStakePerSponsorship: 1234n
        })).toEqual([
            { type: 'unstake', sponsorshipId: 'a', amount: 2000n },
        ])
    })

    it('limits the targetSponsorshipCount to stakeableSponsorships.size', async () => {
        expect(adjustStakes({
            myUnstakedAmount: 600n,
            myCurrentStakes: new Map(),
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 10n }],
                ['b', { payoutPerSec: 20n }],
                ['c', { payoutPerSec: 30n }],
            ]),
            undelegationQueueAmount: 0n,
            operatorContractAddress: '',
            maxSponsorshipCount: 100,
            minTransactionAmount: 0n,
            minStakePerSponsorship: 0n
        }).sort((a, b) => a.sponsorshipId.localeCompare(b.sponsorshipId))).toEqual([
            { type: 'stake', sponsorshipId: 'a', amount: 100n },
            { type: 'stake', sponsorshipId: 'b', amount: 200n },
            { type: 'stake', sponsorshipId: 'c', amount: 300n },
        ])
    })

    it('limits the targetSponsorshipCount to maxSponsorshipCount', async () => {
        expect(adjustStakes({
            myUnstakedAmount: 500n,
            myCurrentStakes: new Map(),
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 10n }], // not included
                ['b', { payoutPerSec: 20n }], // included
                ['c', { payoutPerSec: 30n }], // included
            ]),
            undelegationQueueAmount: 0n,
            operatorContractAddress: '',
            maxSponsorshipCount: 2,
            minTransactionAmount: 0n,
            minStakePerSponsorship: 0n
        }).sort((a, b) => a.sponsorshipId.localeCompare(b.sponsorshipId))).toEqual([
            { type: 'stake', sponsorshipId: 'b', amount: 200n },
            { type: 'stake', sponsorshipId: 'c', amount: 300n },
        ])
    })

    it('limits the targetSponsorshipCount to minStakePerSponsorship and available tokens', async () => {
        expect(adjustStakes({
            myUnstakedAmount: 500n,
            myCurrentStakes: new Map(),
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 10n }], // not included
                ['b', { payoutPerSec: 20n }], // not included
                ['c', { payoutPerSec: 30n }], // included
            ]),
            undelegationQueueAmount: 0n,
            operatorContractAddress: '',
            maxSponsorshipCount: 100,
            minTransactionAmount: 0n,
            minStakePerSponsorship: 300n
        }).sort((a, b) => a.sponsorshipId.localeCompare(b.sponsorshipId))).toEqual([
            { type: 'stake', sponsorshipId: 'c', amount: 500n },
        ])
    })

    it('doesn\'t allocate tokens if less available than minimum stake', async () => {
        expect(adjustStakes({
            myUnstakedAmount: 100n,
            myCurrentStakes: new Map(),
            stakeableSponsorships: new Map([['a', { payoutPerSec: 10n }]]),
            undelegationQueueAmount: 0n,
            operatorContractAddress: '',
            maxSponsorshipCount: 100,
            minTransactionAmount: 0n,
            minStakePerSponsorship: 300n
        })).toEqual([])
    })

    // unstakes must happen first because otherwise there isn't enough tokens for staking
    it('sends out unstakes before stakes', async () => {
        expect(adjustStakes({
            myUnstakedAmount: 0n,
            myCurrentStakes: new Map([
                [ 'a', 30n ],
                [ 'b', 70n ],
            ]),
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 40n }], // add stake here
                ['b', { payoutPerSec: 30n }], // unstake from here
                ['c', { payoutPerSec: 20n }], // stake here
                ['d', { payoutPerSec: 10n }], // stake here
            ]),
            undelegationQueueAmount: 0n,
            operatorContractAddress: '',
            maxSponsorshipCount: 100,
            minTransactionAmount: 0n,
            minStakePerSponsorship: 0n
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
            myUnstakedAmount: 0n,
            myCurrentStakes: new Map([[ 'b', 100n ]]),
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 10n }],
            ]),
            undelegationQueueAmount: 0n,
            operatorContractAddress: '',
            maxSponsorshipCount: 100,
            minTransactionAmount: 0n,
            minStakePerSponsorship: 0n
        })).toIncludeSameMembers([
            { type: 'unstake', sponsorshipId: 'b', amount: 100n },
            { type: 'stake', sponsorshipId: 'a', amount: 100n },
        ])
    })

    it('restakes expired sponsorship stakes into other sponsorships', async () => {
        expect(adjustStakes({
            myUnstakedAmount: 0n,
            myCurrentStakes: new Map([
                [ 'a', 100n ],
                [ 'b', 100n ],
                [ 'c', 100n ],
            ]),
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 10n }],
                ['b', { payoutPerSec: 10n }],
            ]),
            undelegationQueueAmount: 0n,
            operatorContractAddress: '',
            maxSponsorshipCount: 100,
            minTransactionAmount: 0n,
            minStakePerSponsorship: 0n
        })).toIncludeSameMembers([
            { type: 'unstake', sponsorshipId: 'c', amount: 100n },
            { type: 'stake', sponsorshipId: 'a', amount: 50n },
            { type: 'stake', sponsorshipId: 'b', amount: 50n },
        ])
    })

    it('handles rounding errors', async () => {
        expect(adjustStakes({
            myUnstakedAmount: 1000n,
            myCurrentStakes: new Map(),
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 100n }],
                ['b', { payoutPerSec: 100n }],
                ['c', { payoutPerSec: 400n }],
            ]),
            undelegationQueueAmount: 0n,
            operatorContractAddress: '',
            maxSponsorshipCount: 100,
            minTransactionAmount: 0n,
            minStakePerSponsorship: 0n
        })).toIncludeSameMembers([
            { type: 'stake', sponsorshipId: 'a', amount: 166n },
            { type: 'stake', sponsorshipId: 'b', amount: 166n },
            { type: 'stake', sponsorshipId: 'c', amount: 668n },
        ])
    })

    it('rounding error no-op case', async () => {
        expect(adjustStakes({
            myUnstakedAmount: 0n,
            myCurrentStakes: new Map([
                ['a', 166n ],
                ['b', 166n ],
                ['c', 668n ],
            ]),
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 100n }],
                ['b', { payoutPerSec: 100n }],
                ['c', { payoutPerSec: 400n }],
            ]),
            undelegationQueueAmount: 0n,
            operatorContractAddress: '',
            maxSponsorshipCount: 100,
            minTransactionAmount: 0n,
            minStakePerSponsorship: 0n
        })).toEqual([])
    })

    it('handles greater than MAX_SAFE_INTEGER payout values correctly', () => {
        const stakes = adjustStakes({
            myUnstakedAmount: 9n * BigInt(Number.MAX_SAFE_INTEGER),
            myCurrentStakes: new Map(),
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 3n * BigInt(Number.MAX_SAFE_INTEGER) }],
                ['b', { payoutPerSec: 4n * BigInt(Number.MAX_SAFE_INTEGER) }],
                ['c', { payoutPerSec: 2n * BigInt(Number.MAX_SAFE_INTEGER) }],
            ]),
            undelegationQueueAmount: 0n,
            operatorContractAddress: '',
            maxSponsorshipCount: 100,
            minTransactionAmount: 0n,
            minStakePerSponsorship: 0n
        })
        expect(sortBy(stakes, (a) => a.amount).map((a) => a.sponsorshipId)).toEqual(['c', 'a', 'b'])
    })

    it('operators may choose different sponsorships if payoutPerSec are same', () => {
        const createArgs = (operatorContractAddress: string) => {
            return {
                myUnstakedAmount: 1000n,
                myCurrentStakes: new Map(),
                stakeableSponsorships: new Map([
                    ['a', { payoutPerSec: 100n }],
                    ['b', { payoutPerSec: 100n }],
                ]),
                undelegationQueueAmount: 0n,
                operatorContractAddress,
                maxSponsorshipCount: 100,
                minTransactionAmount: 0n,
                minStakePerSponsorship: 1000n
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

    it('undelegation queue', () => {
        expect(adjustStakes({
            myUnstakedAmount: 500n,
            myCurrentStakes: new Map([
                ['a', 2000n ],
                ['b', 3000n ]
            ]),
            stakeableSponsorships: new Map([
                ['a', { payoutPerSec: 20n }],
                ['b', { payoutPerSec: 30n }]
            ]),
            undelegationQueueAmount: 1100n,
            operatorContractAddress: '',
            maxSponsorshipCount: 100,
            minTransactionAmount: 0n,
            minStakePerSponsorship: 100n
        })).toIncludeSameMembers([
            { type: 'unstake', sponsorshipId: 'a', amount: 220n },
            { type: 'unstake', sponsorshipId: 'b', amount: 380n }
        ])
    })

    describe('exclude small transactions', () => {
        it('exclude small stakings', () => {
            expect(adjustStakes({
                myUnstakedAmount: 1000n,
                myCurrentStakes: new Map(),
                stakeableSponsorships: new Map([
                    ['a', { payoutPerSec: 10n }],
                    ['b', { payoutPerSec: 20n }],
                    ['c', { payoutPerSec: 1000n }]
                ]),
                undelegationQueueAmount: 0n,
                operatorContractAddress: '',
                maxSponsorshipCount: 100,
                minTransactionAmount: 20n,
                minStakePerSponsorship: 0n
            })).toIncludeSameMembers([
                { type: 'stake', sponsorshipId: 'c', amount: 972n }
            ])
        })

        it('one small transaction is balanced by removing one staking', () => {
            expect(adjustStakes({
                myUnstakedAmount: 820n,
                myCurrentStakes: new Map([
                    ['a', 180n]
                ]),
                stakeableSponsorships: new Map([
                    ['a', { payoutPerSec: 100n }],
                    ['b', { payoutPerSec: 100n }],
                    ['c', { payoutPerSec: 400n }],
                ]),
                undelegationQueueAmount: 0n,
                operatorContractAddress: '',
                maxSponsorshipCount: 100,
                minTransactionAmount: 20n,
                minStakePerSponsorship: 0n
            })).toIncludeSameMembers([
                { type: 'stake', sponsorshipId: 'c', amount: 668n }
            ])
        })

        it('multiple small transactions are balanced with by removing multiple stakings', () => {
            expect(adjustStakes({
                myUnstakedAmount: 740n,
                myCurrentStakes: new Map([
                    ['a', 180n],
                    ['b', 200n],
                    ['c', 295n]
                ]),
                stakeableSponsorships: new Map([
                    ['a', { payoutPerSec: 100n }],
                    ['b', { payoutPerSec: 100n }],
                    ['c', { payoutPerSec: 210n }],
                    ['d', { payoutPerSec: 220n }],
                    ['e', { payoutPerSec: 230n }]
                ]),
                undelegationQueueAmount: 0n,
                operatorContractAddress: '',
                maxSponsorshipCount: 100,
                minTransactionAmount: 50n,
                minStakePerSponsorship: 0n
            })).toIncludeSameMembers([
                { type: 'stake', sponsorshipId: 'e', amount: 381n }
            ])
        })

        it('multiple small transactions are balanced with by removing all stakings', () => {
            expect(adjustStakes({
                myUnstakedAmount: 359n, 
                myCurrentStakes: new Map([
                    ['a', 180n],
                    ['b', 200n],
                    ['c', 295n],
                    ['e', 381n]
                ]),
                stakeableSponsorships: new Map([
                    ['a', { payoutPerSec: 100n }],
                    ['b', { payoutPerSec: 100n }],
                    ['c', { payoutPerSec: 210n }],
                    ['d', { payoutPerSec: 220n }],
                    ['e', { payoutPerSec: 230n }]
                ]),
                undelegationQueueAmount: 0n,
                operatorContractAddress: '',
                maxSponsorshipCount: 100,
                minTransactionAmount: 50n,
                minStakePerSponsorship: 0n
            })).toEqual([])
        })

        it('very small expiration unstake and nothing to stake', () => {
            expect(adjustStakes({
                myUnstakedAmount: 0n,
                myCurrentStakes: new Map([
                    ['a', 10n],
                    ['b', 1000n]
                ]),
                stakeableSponsorships: new Map([]),
                undelegationQueueAmount: 0n,
                operatorContractAddress: '',
                maxSponsorshipCount: 100,
                minTransactionAmount: 50n,
                minStakePerSponsorship: 0n
            })).toIncludeSameMembers([
                { type: 'unstake', sponsorshipId: 'a', amount: 10n },
                { type: 'unstake', sponsorshipId: 'b', amount: 1000n }
            ])
        })

        it('only multiple very small expiration unstakes', () => {
            expect(adjustStakes({
                myUnstakedAmount: 0n,
                myCurrentStakes: new Map([
                    ['a', 10n],
                    ['b', 20n]
                ]),
                stakeableSponsorships: new Map([]),
                undelegationQueueAmount: 0n,
                operatorContractAddress: '',
                maxSponsorshipCount: 100,
                minTransactionAmount: 50n,
                minStakePerSponsorship: 0n
            })).toIncludeSameMembers([
                { type: 'unstake', sponsorshipId: 'a', amount: 10n },
                { type: 'unstake', sponsorshipId: 'b', amount: 20n }
            ])
        })
    })
})
