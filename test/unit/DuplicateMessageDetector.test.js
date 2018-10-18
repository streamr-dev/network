const DuplicateMessageDetector = require('../../src/logic/DuplicateMessageDetector')

test('starts empty', () => {
    const detector = new DuplicateMessageDetector()
    expect(detector.toString()).toEqual('')
})

test('first check initializes default gap', () => {
    const detector = new DuplicateMessageDetector()
    const result = detector.markAndCheck(1, 10)
    const state = detector.toString()
    expect(result).toEqual(true)
    expect(state).toEqual('(10,Infinity]')
})

test('checking numbers in order introduces no new gaps', () => {
    const detector = new DuplicateMessageDetector()
    detector.markAndCheck(1, 10)
    expect(detector.markAndCheck(10, 15)).toEqual(true)
    expect(detector.markAndCheck(15, 17)).toEqual(true)
    expect(detector.markAndCheck(17, 20)).toEqual(true)
    const state = detector.toString()
    expect(state).toEqual('(20,Infinity]')
})

test('skipping next expected messages creates gaps', () => {
    const detector = new DuplicateMessageDetector()
    detector.markAndCheck(1, 10)

    expect(detector.markAndCheck(15, 20)).toEqual(true)
    expect(detector.toString()).toEqual('(10,15], (20,Infinity]')

    expect(detector.markAndCheck(30, 40)).toEqual(true)
    expect(detector.toString()).toEqual('(10,15], (20,30], (40,Infinity]')

    expect(detector.markAndCheck(80, 100)).toEqual(true)
    expect(detector.toString()).toEqual('(10,15], (20,30], (40,80], (100,Infinity]')
})

describe('gap handling', () => {
    let detector
    beforeEach(() => {
        detector = new DuplicateMessageDetector()
        detector.markAndCheck(1, 10)
        detector.markAndCheck(20, 40)
        detector.markAndCheck(80, 100)
        expect(detector.toString()).toEqual('(10,20], (40,80], (100,Infinity]')
    })

    test('gap division', () => {
        expect(detector.markAndCheck(15, 18))
        expect(detector.toString()).toEqual('(10,15], (18,20], (40,80], (100,Infinity]')

        expect(detector.markAndCheck(60, 79))
        expect(detector.toString()).toEqual('(10,15], (18,20], (40,60], (79,80], (100,Infinity]')
    })

    test('left-side gap contraction', () => {
        expect(detector.markAndCheck(10, 15)).toEqual(true)
        expect(detector.toString()).toEqual('(15,20], (40,80], (100,Infinity]')

        expect(detector.markAndCheck(40, 79)).toEqual(true)
        expect(detector.toString()).toEqual('(15,20], (79,80], (100,Infinity]')
    })

    test('right-side gap contraction', () => {
        expect(detector.markAndCheck(15, 20)).toEqual(true)
        expect(detector.toString()).toEqual('(10,15], (40,80], (100,Infinity]')

        expect(detector.markAndCheck(41, 80)).toEqual(true)
        expect(detector.toString()).toEqual('(10,15], (40,41], (100,Infinity]')
    })

    test('full contraction', () => {
        expect(detector.markAndCheck(40, 80))
        expect(detector.toString()).toEqual('(10,20], (100,Infinity]')

        expect(detector.markAndCheck(10, 20))
        expect(detector.toString()).toEqual('(100,Infinity]')
    })
})

describe('duplicates return false and do not change state', () => {
    let detector
    let expectedState
    beforeEach(() => {
        detector = new DuplicateMessageDetector()
        detector.markAndCheck(1, 10)
        detector.markAndCheck(20, 40)
        detector.markAndCheck(80, 100)
        expectedState = detector.toString()
        expect(expectedState).toEqual('(10,20], (40,80], (100,Infinity]')
    })

    it('way below 1st gap', () => {
        expect(detector.markAndCheck(5, 7)).toEqual(false)
        expect(detector.toString()).toEqual(expectedState)
    })

    it('number touches lower bound of 1st gap', () => {
        expect(detector.markAndCheck(8, 10)).toEqual(false)
        expect(detector.toString()).toEqual(expectedState)
    })

    it('in-between gaps', () => {
        expect(detector.markAndCheck(25, 30)).toEqual(false)
        expect(detector.toString()).toEqual(expectedState)
    })

    it('number touches lower bound of 2nd gap', () => {
        expect(detector.markAndCheck(25, 40)).toEqual(false)
        expect(detector.toString()).toEqual(expectedState)
    })

    it('previous number touches upper bound of 2nd gap', () => {
        expect(detector.markAndCheck(80, 90)).toEqual(false)
        expect(detector.toString()).toEqual(expectedState)
    })
})

describe('erroneous messages that overlap gaps', () => {
    let detector
    let expectedState
    beforeEach(() => {
        detector = new DuplicateMessageDetector()
        detector.markAndCheck(1, 10)
        detector.markAndCheck(20, 40)
        detector.markAndCheck(80, 100)
        expectedState = detector.toString()
        expect(expectedState).toEqual('(10,20], (40,80], (100,Infinity]')
    })

    it('completely around gap', () => {
        expect(() => detector.markAndCheck(5, 30)).toThrowError()
    })

    it('previousNumber below gap while number in gap', () => {
        expect(() => detector.markAndCheck(5, 15)).toThrowError()
    })

    it('previousNumber in gap while number over gap', () => {
        expect(() => detector.markAndCheck(15, 21)).toThrowError()
    })

    it('completely around multiple gaps', () => {
        expect(() => detector.markAndCheck(10, 200)).toThrowError()
    })
})

test('checks that number > previousNumber', () => {
    const detector = new DuplicateMessageDetector()
    expect(() => detector.markAndCheck(5, 1)).toThrowError()
    expect(() => detector.markAndCheck(5, 5)).toThrowError()
})

test('lowest gaps get dropped when reaching maximum number of gaps', () => {
    const detector = new DuplicateMessageDetector(3)
    detector.markAndCheck(1, 10)
    detector.markAndCheck(20, 40)
    detector.markAndCheck(80, 100)
    expect(detector.toString()).toEqual('(10,20], (40,80], (100,Infinity]')

    detector.markAndCheck(150, 200)
    expect(detector.toString()).toEqual('(40,80], (100,150], (200,Infinity]')

    detector.markAndCheck(50, 70)
    expect(detector.toString()).toEqual('(70,80], (100,150], (200,Infinity]')
})
