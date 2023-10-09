import {
    ContractFacade,
    ParseError,
    parsePartitionFromReviewRequestMetadata, ReviewRequestListener,
} from '../../../../src/plugins/operator/ContractFacade'
import { EventEmitter } from 'eventemitter3'
import { randomEthereumAddress } from '@streamr/test-utils'

describe('ContractFacade', () => {

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

    describe('addReviewRequestListener', () => {

        let listener: jest.MockedFn<ReviewRequestListener>
        let fakeOperator: EventEmitter
        let abortController: AbortController
        let helper: ContractFacade
        const sponsorshipAddress = randomEthereumAddress()
        const operatorContractAddress = randomEthereumAddress()
    
        beforeEach(() => {
            listener = jest.fn()
            fakeOperator = new EventEmitter()
            helper = new ContractFacade(fakeOperator as any, undefined as any, undefined as any)
            abortController = new AbortController()
            helper.addReviewRequestListener(listener, abortController.signal)
        })
    
        afterEach(() => {
            abortController.abort()
        })
    
        it('emitting ReviewRequest with valid metadata causes listener to be invoked', () => {
            fakeOperator.emit('ReviewRequest', sponsorshipAddress, operatorContractAddress, '{ "partition": 7 }')
            expect(listener).toHaveBeenLastCalledWith(sponsorshipAddress, operatorContractAddress, 7)
        })
    
        it('emitting ReviewRequest with invalid metadata causes listener to not be invoked', () => {
            fakeOperator.emit('ReviewRequest', sponsorshipAddress, operatorContractAddress, '{ "partition": 666 }')
            expect(listener).not.toHaveBeenCalled()
        })
    
    })
})
