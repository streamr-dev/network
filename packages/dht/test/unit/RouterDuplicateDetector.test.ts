import { RouterDuplicateDetector } from '../../src/dht/RouterDuplicateDetector'

describe('Route Message With Mock Connections', () => {
    let detector: RouterDuplicateDetector
    const maxLimit = 10
    beforeEach(async () => {
        detector = new RouterDuplicateDetector(2**15, 16, 5, maxLimit)
    })

    it('detects duplicates', async () => {
        detector.add('test')
        expect(detector.counter).toEqual(1)
        expect(detector.test('test')).toEqual(true)
    })

    it('resets on resetLimit', () => {
        for (let i = 0; i < maxLimit; i++) {
            detector.add(`test${i}`)
        }
        for (let i = 0; i < maxLimit; i++) {
            expect(detector.test(`test${i}`)).toEqual(true)
        }
        detector.add('test10')
        expect(detector.counter).toEqual(1)
        expect(detector.test('test1')).toEqual(false)
        expect(detector.test('test6')).toEqual(true)
    })
})