import { randomEthereumAddress } from '@streamr/test-utils'
import { wait } from '@streamr/utils'
import {
    OperatorContractFacade,
    ParseError,
    parsePartitionFromReviewRequestMetadata
} from '../../src/contracts/OperatorContractFacade'
import { mockLoggerFactory } from '../test-utils/utils'

describe(parsePartitionFromReviewRequestMetadata, () => {
    it('throws given undefined', () => {
        expect(() => parsePartitionFromReviewRequestMetadata(undefined)).toThrowError(ParseError)
    })

    it('throws given invalid json', () => {
        expect(() => parsePartitionFromReviewRequestMetadata('invalidjson')).toThrowError(ParseError)
    })

    it('throws given valid json without field "partition"', () => {
        expect(() => parsePartitionFromReviewRequestMetadata('{}')).toThrowError(ParseError)
    })

    it('throws given valid json with field "partition" but not as a number', () => {
        expect(() => parsePartitionFromReviewRequestMetadata('{ "partition": "foo" }')).toThrowError(ParseError)
    })

    it('throws given valid json with field "partition" but outside integer range', () => {
        expect(() => parsePartitionFromReviewRequestMetadata('{ "partition": -50 }')).toThrowError(ParseError)
    })

    it('returns partition given valid json with field "partition" within integer range', () => {
        expect(parsePartitionFromReviewRequestMetadata('{ "partition": 50 }')).toEqual(50)
    })
})

const POLL_INTERVAL = 100
const OPERATOR_CONTRACT_ADDRESS = randomEthereumAddress()
const SPONSORSHIP_ADDRESS = randomEthereumAddress()
const INITIAL_BLOCK_NUMBER = 111
const EVENT_BLOCK_NUMBER = 222

const createOperatorContractFacade = (eventName: string, args: any[]) => {
    const fakeContract = {
        queryFilter: (eventNames: string[], fromBlock: number) => {
            if ((eventNames[0][0] === eventName) && (fromBlock <= EVENT_BLOCK_NUMBER)) {
                return [{
                    fragment: {
                        name: eventName
                    },
                    args,
                    blockNumber: EVENT_BLOCK_NUMBER
                }]
            } else {
                return []
            }
        },
        runner: {
            provider: {
                getBlockNumber: async () => INITIAL_BLOCK_NUMBER
            }
        }
    }
    return new OperatorContractFacade(
        OPERATOR_CONTRACT_ADDRESS,
        {
            createReadContract: () => fakeContract,
            createEventContract: () => fakeContract
        } as any,
        {
            getProvider: () => undefined,
            getSubProviders: () => ['dummy']
        } as any,
        undefined as any,
        undefined as any,
        undefined as any,
        mockLoggerFactory(),
        POLL_INTERVAL
    )
}

describe('OperatorContractFacade', () => {

    describe('reviewRequest listener', () => {
    
        it('emitting ReviewRequest with valid metadata causes listener to be invoked', async () => {
            const operatorContractFacade = createOperatorContractFacade('ReviewRequest', [SPONSORSHIP_ADDRESS, OPERATOR_CONTRACT_ADDRESS, 1000, 1050, '{ "partition": 7 }'])
            const listener = jest.fn()
            operatorContractFacade.on('reviewRequest', listener)
            await wait(1.5 * POLL_INTERVAL)
            expect(listener).toHaveBeenLastCalledWith({ 
                sponsorship: SPONSORSHIP_ADDRESS, 
                targetOperator: OPERATOR_CONTRACT_ADDRESS,
                partition: 7,
                votingPeriodStartTimestamp: 1000 * 1000,
                votingPeriodEndTimestamp: 1050 * 1000
            })
            operatorContractFacade.off('reviewRequest', listener)
        })
    
        it('emitting ReviewRequest with invalid metadata causes listener to not be invoked', async () => {
            const operatorContractFacade = createOperatorContractFacade('ReviewRequest', [SPONSORSHIP_ADDRESS, OPERATOR_CONTRACT_ADDRESS, 1000, 1050, '{ "partition": 666 }'])
            const listener = jest.fn()
            operatorContractFacade.on('reviewRequest', listener)
            await wait(1.5 * POLL_INTERVAL)
            expect(listener).not.toHaveBeenCalled()
            operatorContractFacade.off('reviewRequest', listener)
        })
    })
})
