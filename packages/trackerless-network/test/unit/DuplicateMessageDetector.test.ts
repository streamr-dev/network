import {
    DuplicateMessageDetector,
    NumberPair,
    GapMisMatchError,
    InvalidNumberingError
} from '../../src/logic/DuplicateMessageDetector'

test('starts empty', () => {
    const detector = new DuplicateMessageDetector()
    expect(detector.toString()).toEqual('')
})

test('first check initializes default gap', () => {
    const detector = new DuplicateMessageDetector()
    const result = detector.markAndCheck(new NumberPair(1, 5), new NumberPair(10, 10))
    const state = detector.toString()
    expect(result).toEqual(true)
    expect(state).toEqual('(10|10, Infinity|Infinity]')
})

test('checking numbers in order introduces no new gaps', () => {
    const detector = new DuplicateMessageDetector()
    detector.markAndCheck(null, new NumberPair(10, 0))
    expect(detector.markAndCheck(new NumberPair(10, 0), new NumberPair(20, 0))).toEqual(true)
    expect(detector.markAndCheck(new NumberPair(20, 0), new NumberPair(30, 0))).toEqual(true)
    expect(detector.markAndCheck(null, new NumberPair(30, 1))).toEqual(true)
    expect(detector.markAndCheck(new NumberPair(30, 1), new NumberPair(30, 5))).toEqual(true)
    const state = detector.toString()
    expect(state).toEqual('(30|5, Infinity|Infinity]')
})

test('skipping next expected messages creates gaps', () => {
    const detector = new DuplicateMessageDetector()
    detector.markAndCheck(null, new NumberPair(10, 0))

    expect(detector.markAndCheck(new NumberPair(15, 0), new NumberPair(20, 0))).toEqual(true)
    expect(detector.toString()).toEqual('(10|0, 15|0], (20|0, Infinity|Infinity]')

    expect(detector.markAndCheck(new NumberPair(30, 0), new NumberPair(40, 0))).toEqual(true)
    expect(detector.toString()).toEqual('(10|0, 15|0], (20|0, 30|0], (40|0, Infinity|Infinity]')

    expect(detector.markAndCheck(new NumberPair(40, 10), new NumberPair(80, 20))).toEqual(true)
    expect(detector.toString()).toEqual('(10|0, 15|0], (20|0, 30|0], (40|0, 40|10], (80|20, Infinity|Infinity]')
})

test('only last gap is checked if no previous number given', () => {
    const detector = new DuplicateMessageDetector()
    detector.markAndCheck(null, new NumberPair(10, 0))
    detector.markAndCheck(new NumberPair(10, 0), new NumberPair(20, 0))

    expect(detector.markAndCheck(null, new NumberPair(15, 0))).toEqual(false)
    expect(detector.markAndCheck(null, new NumberPair(30, 5))).toEqual(true)
    const state = detector.toString()
    expect(state).toEqual('(30|5, Infinity|Infinity]')
})

describe('gap handling', () => {
    let detector: DuplicateMessageDetector
    beforeEach(() => {
        detector = new DuplicateMessageDetector()
        detector.markAndCheck(null, new NumberPair(10, 0))
        detector.markAndCheck(new NumberPair(20, 0), new NumberPair(40, 0))
        detector.markAndCheck(new NumberPair(80, 10), new NumberPair(100, 0))
        expect(detector.toString()).toEqual('(10|0, 20|0], (40|0, 80|10], (100|0, Infinity|Infinity]')
    })

    test('gap division', () => {
        expect(detector.markAndCheck(new NumberPair(15, 0), new NumberPair(18, 0))).toEqual(true)
        expect(detector.toString()).toEqual('(10|0, 15|0], (18|0, 20|0], (40|0, 80|10], (100|0, Infinity|Infinity]')

        expect(detector.markAndCheck(new NumberPair(60, 0), new NumberPair(79, 5))).toEqual(true)
        expect(detector.toString()).toEqual(
            '(10|0, 15|0], (18|0, 20|0], (40|0, 60|0], (79|5, 80|10], (100|0, Infinity|Infinity]'
        )
    })

    test('left-side gap contraction', () => {
        expect(detector.markAndCheck(new NumberPair(10, 0), new NumberPair(15, 0))).toEqual(true)
        expect(detector.toString()).toEqual('(15|0, 20|0], (40|0, 80|10], (100|0, Infinity|Infinity]')

        expect(detector.markAndCheck(new NumberPair(40, 0), new NumberPair(80, 9))).toEqual(true)
        expect(detector.toString()).toEqual('(15|0, 20|0], (80|9, 80|10], (100|0, Infinity|Infinity]')
    })

    test('right-side gap contraction', () => {
        expect(detector.markAndCheck(new NumberPair(15, 0), new NumberPair(20, 0))).toEqual(true)
        expect(detector.toString()).toEqual('(10|0, 15|0], (40|0, 80|10], (100|0, Infinity|Infinity]')

        expect(detector.markAndCheck(new NumberPair(40, 1), new NumberPair(80, 10))).toEqual(true)
        expect(detector.toString()).toEqual('(10|0, 15|0], (40|0, 40|1], (100|0, Infinity|Infinity]')
    })

    test('full contraction', () => {
        expect(detector.markAndCheck(new NumberPair(40, 0), new NumberPair(80, 10))).toEqual(true)
        expect(detector.toString()).toEqual('(10|0, 20|0], (100|0, Infinity|Infinity]')

        expect(detector.markAndCheck(new NumberPair(10, 0), new NumberPair(20, 0))).toEqual(true)
        expect(detector.toString()).toEqual('(100|0, Infinity|Infinity]')
    })
})

describe('duplicates return false and do not change state', () => {
    let detector: DuplicateMessageDetector
    let expectedState: string
    beforeEach(() => {
        detector = new DuplicateMessageDetector()
        detector.markAndCheck(new NumberPair(1, 0), new NumberPair(10, 0))
        detector.markAndCheck(new NumberPair(20, 0), new NumberPair(40, 0))
        detector.markAndCheck(new NumberPair(80, 10), new NumberPair(100, 0))
        expectedState = detector.toString()
        expect(expectedState).toEqual('(10|0, 20|0], (40|0, 80|10], (100|0, Infinity|Infinity]')
    })

    it('way below 1st gap', () => {
        expect(detector.markAndCheck(new NumberPair(5, 0), new NumberPair(7, 0))).toEqual(false)
        expect(detector.toString()).toEqual(expectedState)
    })

    it('number touches lower bound of 1st gap', () => {
        expect(detector.markAndCheck(new NumberPair(8, 0), new NumberPair(10, 0))).toEqual(false)
        expect(detector.toString()).toEqual(expectedState)
    })

    it('in-between gaps', () => {
        expect(detector.markAndCheck(new NumberPair(25, 5), new NumberPair(30, 0))).toEqual(false)
        expect(detector.toString()).toEqual(expectedState)
    })

    it('number touches lower bound of 2nd gap', () => {
        expect(detector.markAndCheck(new NumberPair(25, 0), new NumberPair(40, 0))).toEqual(false)
        expect(detector.toString()).toEqual(expectedState)
    })

    it('previous number touches upper bound of 2nd gap', () => {
        expect(detector.markAndCheck(new NumberPair(80, 10), new NumberPair(90, 0))).toEqual(false)
        expect(detector.toString()).toEqual(expectedState)
    })

    it('previous number not provided, number is below last gap', () => {
        expect(detector.markAndCheck(null, new NumberPair(80, 10))).toEqual(false)
        expect(detector.toString()).toEqual(expectedState)
    })

    it('previous number not provided, number touches lower bound of last gap', () => {
        expect(detector.markAndCheck(null, new NumberPair(100, 0))).toEqual(false)
        expect(detector.toString()).toEqual(expectedState)
    })
})

describe('erroneous messages that overlap gaps', () => {
    let detector: DuplicateMessageDetector
    let expectedState
    beforeEach(() => {
        detector = new DuplicateMessageDetector()
        detector.markAndCheck(new NumberPair(1, 0), new NumberPair(10, 0))
        detector.markAndCheck(new NumberPair(20, 0), new NumberPair(40, 0))
        detector.markAndCheck(new NumberPair(80, 10), new NumberPair(100, 0))
        expectedState = detector.toString()
        expect(expectedState).toEqual('(10|0, 20|0], (40|0, 80|10], (100|0, Infinity|Infinity]')
    })

    it('completely around gap', () => {
        expect(() => detector.markAndCheck(new NumberPair(5, 0), new NumberPair(30, 0))).toThrow(GapMisMatchError)
    })

    it('previousNumber below gap while number in gap', () => {
        expect(() => detector.markAndCheck(new NumberPair(5, 0), new NumberPair(15, 0))).toThrow(GapMisMatchError)
    })

    it('previousNumber in gap while number over gap', () => {
        expect(() => detector.markAndCheck(new NumberPair(15, 0), new NumberPair(20, 5))).toThrow(GapMisMatchError)
    })

    it('completely around multiple gaps', () => {
        expect(() => detector.markAndCheck(new NumberPair(10, 0), new NumberPair(200, 0))).toThrow(GapMisMatchError)
    })
})

test('checks that number > previousNumber', () => {
    const detector = new DuplicateMessageDetector()
    expect(() => detector.markAndCheck(new NumberPair(5, 0), new NumberPair(1, 0))).toThrow(InvalidNumberingError)
    expect(() => detector.markAndCheck(new NumberPair(5, 5), new NumberPair(5, 5))).toThrow(InvalidNumberingError)
})

test('lowest gaps get dropped when reaching maximum number of gaps', () => {
    const detector = new DuplicateMessageDetector(3)
    detector.markAndCheck(new NumberPair(1, 0), new NumberPair(10, 0))
    detector.markAndCheck(new NumberPair(20, 0), new NumberPair(40, 0))
    detector.markAndCheck(new NumberPair(80, 10), new NumberPair(100, 0))
    expect(detector.toString()).toEqual('(10|0, 20|0], (40|0, 80|10], (100|0, Infinity|Infinity]')

    detector.markAndCheck(new NumberPair(150, 0), new NumberPair(200, 0))
    expect(detector.toString()).toEqual('(40|0, 80|10], (100|0, 150|0], (200|0, Infinity|Infinity]')

    detector.markAndCheck(new NumberPair(50, 0), new NumberPair(70, 0))
    expect(detector.toString()).toEqual('(70|0, 80|10], (100|0, 150|0], (200|0, Infinity|Infinity]')
})
