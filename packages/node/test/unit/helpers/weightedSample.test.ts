import { weightedSample } from '../../../src/helpers/weightedSample'
import { range, repeat, sum } from 'lodash'

describe(weightedSample, () => {
    it('returns undefined on empty array', () => {
        const result = weightedSample<number>([], () => 1)
        expect(result).toBeUndefined()
    })

    it('returns single item on singleton array', () => {
        const result = weightedSample(['a'], () => 10)
        expect(result).toEqual('a')
    })

    it('returns items at uniform probability when weights are equal', () => {
        let counter = 0
        const results = range(15).map(() => {
            return weightedSample(
                ['a', 'b', 'c'],
                () => 5,
                () => counter++
            )
        })
        expect(results).toEqual([...repeat('a', 5), ...repeat('b', 5), ...repeat('c', 5)])
    })

    it('returns items at proportional probability when weights are unequal', () => {
        const weights: Record<string, number> = {
            a: 1,
            b: 3,
            c: 10,
            d: 1
        }
        let counter = 0
        const results = range(15).map(() => {
            return weightedSample(
                ['a', 'b', 'c', 'd'],
                (item) => weights[item],
                () => counter++
            )
        })
        expect(results).toEqual([
            ...repeat('a', weights.a),
            ...repeat('b', weights.b),
            ...repeat('c', weights.c),
            ...repeat('d', weights.d)
        ])
    })

    describe('sampleFn callback', () => {
        it('not called on empty array', () => {
            const sampleFn = jest.fn().mockReturnValue(0)
            weightedSample([], () => 1, sampleFn)
            expect(sampleFn).not.toHaveBeenCalled()
        })

        it('called with expected weight on singleton array', () => {
            const sampleFn = jest.fn().mockReturnValue(0)
            weightedSample(['a'], () => 10, sampleFn)
            expect(sampleFn).toHaveBeenCalledWith(0, 9)
        })

        it('called with expected weight on array', () => {
            const sampleFn = jest.fn().mockReturnValue(0)
            const weights: Record<string, number> = {
                a: 1,
                b: 3,
                c: 10,
                d: 1
            }
            weightedSample(['a', 'b', 'c', 'd'], (item) => weights[item], sampleFn)
            expect(sampleFn).toHaveBeenCalledWith(0, sum(Object.values(weights)) - 1)
        })
    })
})
