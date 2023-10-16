import { DuplicateDetector } from '../../src/dht/routing/DuplicateDetector'

describe('Duplicate Detector', () => {
    let detector: DuplicateDetector
    const maxLimit = 10
    beforeEach(async () => {
        detector = new DuplicateDetector(maxLimit, 100)
    })

    it('detects duplicates', async () => {
        detector.add('test')
        expect(detector.size()).toEqual(1)
        expect(detector.isMostLikelyDuplicate('test')).toEqual(true)
    })

    it('resets on resetLimit', () => {
        for (let i = 0; i < maxLimit; i++) {
            detector.add(`test${i}`)
        }
        for (let i = 0; i < maxLimit; i++) {
            expect(detector.isMostLikelyDuplicate(`test${i}`)).toEqual(true)
        }
        detector.add('test10')
        expect(detector.size()).toEqual(10)
        expect(detector.isMostLikelyDuplicate('test0')).toEqual(false)
        expect(detector.isMostLikelyDuplicate('test10')).toEqual(true)
    })
})
