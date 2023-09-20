import {
    ParseError,
    parsePartitionFromMetadata, ReviewRequestListener, VoteOnSuspectNodeHelper,
} from '../../../../src/plugins/operator/VoteOnSuspectNodeHelper'
import { EventEmitter } from 'eventemitter3'

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

describe(VoteOnSuspectNodeHelper, () => {
    let listener: jest.MockedFn<ReviewRequestListener>
    let fakeOperator: EventEmitter
    let abortController: AbortController
    let helper: VoteOnSuspectNodeHelper

    beforeEach(() => {
        listener = jest.fn()
        fakeOperator = new EventEmitter()
        helper = new VoteOnSuspectNodeHelper({} as any, fakeOperator as any)
        abortController = new AbortController()
        helper.addReviewRequestListener(listener, abortController.signal)
    })

    afterEach(() => {
        abortController.abort()
    })

    it('emitting ReviewRequest with valid metadata causes listener to be invoked', () => {
        fakeOperator.emit('ReviewRequest', 'sponsorship', 'operatorContractAddress', '{ "partition": 7 }')
        expect(listener).toHaveBeenLastCalledWith('sponsorship', 'operatorContractAddress', 7)
    })

    it('emitting ReviewRequest with invalid metadata causes listener to not be invoked', () => {
        fakeOperator.emit('ReviewRequest', 'sponsorship', 'operatorContractAddress', '{ "partition": 666 }')
        expect(listener).not.toHaveBeenCalled()
    })
})
