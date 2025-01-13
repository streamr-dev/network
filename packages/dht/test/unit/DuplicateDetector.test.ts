import { DuplicateDetector } from '../../src/dht/routing/DuplicateDetector'

const MAX_VALUE_COUNT = 10

describe('Duplicate Detector', () => {
    let detector: DuplicateDetector

    beforeEach(async () => {
        detector = new DuplicateDetector(MAX_VALUE_COUNT)
    })

    it('detects duplicates', async () => {
        detector.add('test')
        expect(detector.size()).toEqual(1)
        expect(detector.isMostLikelyDuplicate('test')).toEqual(true)
    })

    it('removes from tail when full', () => {
        for (let i = 0; i < MAX_VALUE_COUNT; i++) {
            detector.add(`test${i}`)
        }
        for (let i = 0; i < MAX_VALUE_COUNT; i++) {
            expect(detector.isMostLikelyDuplicate(`test${i}`)).toEqual(true)
        }
        detector.add('test10')
        expect(detector.size()).toEqual(10)
        expect(detector.isMostLikelyDuplicate('test0')).toEqual(false)
        expect(detector.isMostLikelyDuplicate('test10')).toEqual(true)
    })
})
