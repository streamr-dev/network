import 'reflect-metadata'

import { randomEthereumAddress } from '@streamr/test-utils'
import { wait } from '@streamr/utils'
import { capitalize, random } from 'lodash'
import { DestroySignal } from '../../src/DestroySignal'
import { EventListenerDefinition } from '../../src/contracts/ChainEventPoller'
import {
    Operator,
    OperatorEvents,
    ParseError,
    parsePartitionFromReviewRequestMetadata
} from '../../src/contracts/Operator'
import { mockLoggerFactory } from '../test-utils/utils'

describe(parsePartitionFromReviewRequestMetadata, () => {
    it('throws given undefined', () => {
        expect(() => parsePartitionFromReviewRequestMetadata(undefined)).toThrow(ParseError)
    })

    it('throws given invalid json', () => {
        expect(() => parsePartitionFromReviewRequestMetadata('invalidjson')).toThrow(ParseError)
    })

    it('throws given valid json without field "partition"', () => {
        expect(() => parsePartitionFromReviewRequestMetadata('{}')).toThrow(ParseError)
    })

    it('throws given valid json with field "partition" but not as a number', () => {
        expect(() => parsePartitionFromReviewRequestMetadata('{ "partition": "foo" }')).toThrow(ParseError)
    })

    it('throws given valid json with field "partition" but outside integer range', () => {
        expect(() => parsePartitionFromReviewRequestMetadata('{ "partition": -50 }')).toThrow(ParseError)
    })

    it('returns partition given valid json with field "partition" within integer range', () => {
        expect(parsePartitionFromReviewRequestMetadata('{ "partition": 50 }')).toEqual(50)
    })
})

const POLL_INTERVAL = 50
const OPERATOR_CONTRACT_ADDRESS = randomEthereumAddress()
const SPONSORSHIP_ADDRESS = randomEthereumAddress()

const createOperator = (eventName: string, eventArgs: any[]): Operator => {
    const chainEventPoller = {
        on: (definition: EventListenerDefinition) => {
            if (definition.contractInterfaceFragment.name === eventName) {
                setTimeout(() => {
                    definition.onEvent(...eventArgs)
                }, random(POLL_INTERVAL))
            }
        }
    }
    const contractFactory = {
        createReadContract: () => ({})
    }
    const rpcProviderSource = {
        getProvider: () => ({})
    }
    return new Operator(
        OPERATOR_CONTRACT_ADDRESS,
        contractFactory as any,
        rpcProviderSource as any,
        chainEventPoller as any,
        undefined as any,
        undefined as any,
        new DestroySignal(),
        mockLoggerFactory(),
        undefined as any
    )
}

describe('Operator', () => {

    describe('reviewRequest listener', () => {

        it('emitting ReviewRequest with valid metadata causes listener to be invoked', async () => {
            const operator = createOperator(
                'ReviewRequest',
                [SPONSORSHIP_ADDRESS, OPERATOR_CONTRACT_ADDRESS, 1000n, 1050n, '{ "partition": 7 }']
            )
            const listener = jest.fn()
            operator.on('reviewRequested', listener)
            await wait(1.5 * POLL_INTERVAL)
            expect(listener).toHaveBeenLastCalledWith({
                sponsorship: SPONSORSHIP_ADDRESS,
                targetOperator: OPERATOR_CONTRACT_ADDRESS,
                partition: 7,
                votingPeriodStartTimestamp: 1000 * 1000,
                votingPeriodEndTimestamp: 1050 * 1000
            })
        })

        it('emitting ReviewRequest with invalid metadata causes listener to not be invoked', async () => {
            const operator = createOperator(
                'ReviewRequest',
                [SPONSORSHIP_ADDRESS, OPERATOR_CONTRACT_ADDRESS, 1000n, 1050n, '{ "partition": 666 }']
            )
            const listener = jest.fn()
            operator.on('reviewRequested', listener)
            await wait(1.5 * POLL_INTERVAL)
            expect(listener).not.toHaveBeenCalled()
        })
    })

    describe('stake events', () => {

        it.each(['staked', 'unstaked'])('handle %s event', async (eventName: string) => {
            const operator = createOperator(
                capitalize(eventName),
                [SPONSORSHIP_ADDRESS]
            )
            const listener = jest.fn()
            operator.on(eventName as keyof OperatorEvents, listener)
            await wait(1.5 * POLL_INTERVAL)
            expect(listener).toHaveBeenLastCalledWith({
                sponsorship: SPONSORSHIP_ADDRESS
            })
        })
    })
})
