import { NumberPair } from '../../src/logic/DuplicateMessageDetector'

test('equalTo', () => {
    expect(new NumberPair(5, 2).equalTo(new NumberPair(5, 3))).toEqual(false)
    expect(new NumberPair(5, 2).equalTo(new NumberPair(5, 2))).toEqual(true)
})

test('greaterThan', () => {
    expect(new NumberPair(5, 2).greaterThan(new NumberPair(6, 2))).toEqual(false)
    expect(new NumberPair(5, 2).greaterThan(new NumberPair(5, 3))).toEqual(false)
    expect(new NumberPair(5, 2).greaterThan(new NumberPair(5, 2))).toEqual(false)
    expect(new NumberPair(5, 2).greaterThan(new NumberPair(5, 1))).toEqual(true)
    expect(new NumberPair(5, 2).greaterThan(new NumberPair(3, 2))).toEqual(true)
})

test('greaterThanOrEqual', () => {
    expect(new NumberPair(5, 2).greaterThanOrEqual(new NumberPair(6, 2))).toEqual(false)
    expect(new NumberPair(5, 2).greaterThanOrEqual(new NumberPair(5, 3))).toEqual(false)
    expect(new NumberPair(5, 2).greaterThanOrEqual(new NumberPair(5, 2))).toEqual(true)
    expect(new NumberPair(5, 2).greaterThanOrEqual(new NumberPair(5, 1))).toEqual(true)
    expect(new NumberPair(5, 2).greaterThanOrEqual(new NumberPair(3, 2))).toEqual(true)
})
