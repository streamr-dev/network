import {
    ContractFacade,
    ParseError,
    parsePartitionFromMetadata, ReviewRequestListener,
} from '../../../../src/plugins/operator/ContractFacade'
import { EventEmitter } from 'eventemitter3'
import { randomEthereumAddress } from '@streamr/test-utils'

const sponsorshipAddress = randomEthereumAddress()
const operatorContractAddress = randomEthereumAddress()

describe(parsePartitionFromMetadata, () => {
    it('throws given undefined', () => {
        expect(() => parsePartitionFromMetadata(undefined)).toThrowError(ParseError)
    })

    it('throws given invalid json', () => {
        expect(() => parsePartitionFromMetadata('invalidjson')).toThrowError(ParseError)
    })

    it('throws given valid json without field "partition"', () => {
        expect(() => parsePartitionFromMetadata('{}')).toThrowError(ParseError)
    })

    it('throws given valid json with field "partition" but not as a number', () => {
        expect(() => parsePartitionFromMetadata('{ "partition": "foo" }')).toThrowError(ParseError)
    })

    it('throws given valid json with field "partition" but outside integer range', () => {
        expect(() => parsePartitionFromMetadata('{ "partition": -50 }')).toThrowError(ParseError)
    })

    it('returns partition given valid json with field "partition" within integer range', () => {
        expect(parsePartitionFromMetadata('{ "partition": 50 }')).toEqual(50)
    })
})

// TODO enable test and rename test file
describe.skip('VoteOnSuspectNodeHelper', () => {
    let listener: jest.MockedFn<ReviewRequestListener>
    let fakeOperator: EventEmitter
    let abortController: AbortController
    let helper: ContractFacade

    beforeEach(() => {
        listener = jest.fn()
        fakeOperator = new EventEmitter()
        helper = undefined as any // TODO new ContractFacade({} as any, fakeOperator as any)
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
