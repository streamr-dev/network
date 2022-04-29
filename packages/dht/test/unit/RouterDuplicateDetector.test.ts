import { RouterDuplicateDetector } from '../../src/dht/RouterDuplicateDetector'

describe('Route Message With Mock Connections', () => {
    let detector: RouterDuplicateDetector

    beforeEach(async () => {
        detector = new RouterDuplicateDetector(2**15, 16, 5, 10)
    })

    afterEach(async () => {
        await node.stop()
    })

    it('detects duplicates', async () => {
        detector.add('test')
        expect(detector.counter).toEqual(1)
        expect(detector.test('test')).toEqual(true)
    })

    it('resets on resetLimit', () => {
        detector.add('test0')
        detector.add('test1')
        detector.add('test2')
        detector.add('test3')
        detector.add('test4')
        detector.add('test5')
        detector.add('test6')
        detector.add('test7')
        detector.add('test8')
        detector.add('test9')
        expect(detector.test('test0')).toEqual(true)
        expect(detector.test('test1')).toEqual(true)
        expect(detector.test('test2')).toEqual(true)
        expect(detector.test('test3')).toEqual(true)
        expect(detector.test('test4')).toEqual(true)
        expect(detector.test('test5')).toEqual(true)
        expect(detector.test('test6')).toEqual(true)
        expect(detector.test('test7')).toEqual(true)
        expect(detector.test('test8')).toEqual(true)
        expect(detector.test('test9')).toEqual(true)
        detector.add('test10')
        expect(detector.counter).toEqual(0)
        expect(detector.test('test1')).toEqual(false)
        expect(detector.test('test6')).toEqual(true)
    })
})