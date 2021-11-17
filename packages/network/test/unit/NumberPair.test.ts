import { NumberPair } from '../../src/logic/node/DuplicateMessageDetector'

it('equalTo', () => {
    expect(new NumberPair(5, 2).equalTo(new NumberPair(5, 3))).toEqual(false)
    expect(new NumberPair(5, 2).equalTo(new NumberPair(5, 2))).toEqual(true)
})

it('greaterThan', () => {
    expect(new NumberPair(5, 2).greaterThan(new NumberPair(6, 2))).toEqual(false)
    expect(new NumberPair(5, 2).greaterThan(new NumberPair(5, 3))).toEqual(false)
    expect(new NumberPair(5, 2).greaterThan(new NumberPair(5, 2))).toEqual(false)
    expect(new NumberPair(5, 2).greaterThan(new NumberPair(5, 1))).toEqual(true)
    expect(new NumberPair(5, 2).greaterThan(new NumberPair(3, 2))).toEqual(true)
})

it('greaterThanOrEqual', () => {
    expect(new NumberPair(5, 2).greaterThanOrEqual(new NumberPair(6, 2))).toEqual(false)
    expect(new NumberPair(5, 2).greaterThanOrEqual(new NumberPair(5, 3))).toEqual(false)
    expect(new NumberPair(5, 2).greaterThanOrEqual(new NumberPair(5, 2))).toEqual(true)
    expect(new NumberPair(5, 2).greaterThanOrEqual(new NumberPair(5, 1))).toEqual(true)
    expect(new NumberPair(5, 2).greaterThanOrEqual(new NumberPair(3, 2))).toEqual(true)
})
