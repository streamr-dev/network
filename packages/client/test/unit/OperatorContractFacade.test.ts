import { randomEthereumAddress } from '@streamr/test-utils'
import { wait } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import {
    ParseError,
    ReviewRequestListener,
    parsePartitionFromReviewRequestMetadata
} from '../../src/contracts/OperatorContractFacade'

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

describe('OperatorContractFacade', () => {

    describe.skip('addReviewRequestListener', () => {  // TODO re-enable or implement as integration/end-to-end test?

        let listener: jest.MockedFn<ReviewRequestListener>
        let fakeOperator: EventEmitter
        let abortController: AbortController
        const sponsorshipAddress = randomEthereumAddress()
        const operatorContractAddress = randomEthereumAddress()
    
        beforeEach(() => {
            listener = jest.fn()
            fakeOperator = new class extends EventEmitter {
                // eslint-disable-next-line class-methods-use-this
                async getAddress() {
                    return operatorContractAddress
                }
            }()
            /*TODO const helper = new OperatorContractFacade(
                operatorContractAddress,
                {
                    createReadContract: () => fakeOperator
                } as any,
                {
                    getProvider: () => undefined
                } as any,
                undefined as any,
                undefined as any,
                undefined as any,
                mockLoggerFactory(),
                9999
            )
            abortController = new AbortController()
            helper.addReviewRequestListener(listener, abortController.signal)*/
        })
    
        afterEach(() => {
            abortController.abort()
        })
    
        it('emitting ReviewRequest with valid metadata causes listener to be invoked', async () => {
            fakeOperator.emit('ReviewRequest', sponsorshipAddress, operatorContractAddress, 1000, 1050, '{ "partition": 7 }')
            await wait(0)
            expect(listener).toHaveBeenLastCalledWith(sponsorshipAddress, operatorContractAddress, 7, 1000 * 1000, 1050 * 1000)
        })
    
        it('emitting ReviewRequest with invalid metadata causes listener to not be invoked', async () => {
            fakeOperator.emit('ReviewRequest', sponsorshipAddress, operatorContractAddress, 1000, 1050, '{ "partition": 666 }')
            await wait(0)
            expect(listener).not.toHaveBeenCalled()
        })
    
    })
})
