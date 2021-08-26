import { Speedometer } from '../../src/helpers/Speedometer'

const WINDOW_SIZE_IN_SECONDS = 5

const createMockCurrentTimeProvider = () => {
    let now: number
    const fn = () => now
    fn.set = (dateStr: string) => now = new Date(dateStr).getTime()
    return fn
}

describe('Speedometer', () => {

    let speedometer: Speedometer
    let currentTimeProvider = createMockCurrentTimeProvider()

    beforeEach(() => {
        currentTimeProvider.set('2000-01-02T00:00:00.123Z')
        speedometer = new Speedometer(WINDOW_SIZE_IN_SECONDS, currentTimeProvider)
    })

    it('empty', () => {
        currentTimeProvider.set('2000-01-02T03:04:05.678Z')
        expect(speedometer.getRate()).toBe(0)
    })

    it('get immedatelly', () => {
        currentTimeProvider.set('2000-01-02T03:04:05.678Z')
        speedometer.record(100)
        expect(speedometer.getRate()).toBe(20)
    })

    it('get after delay', () => {
        currentTimeProvider.set('2000-01-02T03:04:05.678Z')
        speedometer.record(100)
        currentTimeProvider.set('2000-01-02T03:04:06.678Z')
        expect(speedometer.getRate()).toBe(100 / WINDOW_SIZE_IN_SECONDS)
    })

    it('get multiple after delay', () => {
        currentTimeProvider.set('2000-01-02T03:04:05.777Z')
        speedometer.record(100)
        currentTimeProvider.set('2000-01-02T03:04:05.888Z')
        speedometer.record(150)
        currentTimeProvider.set('2000-01-02T03:04:06.111Z')
        speedometer.record(60)
        currentTimeProvider.set('2000-01-02T03:04:06.222Z')
        speedometer.record(70)
        currentTimeProvider.set('2000-01-02T03:04:08.999Z')
        expect(speedometer.getRate()).toBe(380 / WINDOW_SIZE_IN_SECONDS)
    })

    it('get partially expired', () => {
        currentTimeProvider.set('2000-01-02T03:04:05.678Z')
        speedometer.record(100)
        currentTimeProvider.set('2000-01-02T03:04:10.123Z')
        expect(speedometer.getRate()).toBeCloseTo((100 - 12.3) / WINDOW_SIZE_IN_SECONDS)
    })

    it('get partially expired: data too old but within same UTC second', () => {
        currentTimeProvider.set('2000-01-02T03:04:05.678Z')
        speedometer.record(100)
        currentTimeProvider.set('2000-01-02T03:04:10.888Z')
        expect(speedometer.getRate()).toBeCloseTo((100 - 88.8) / WINDOW_SIZE_IN_SECONDS)
    })

    it('expired', () => {
        currentTimeProvider.set('2000-01-02T03:04:05.678Z')
        speedometer.record(100)
        currentTimeProvider.set('2000-01-02T03:04:20.000Z')
        expect(speedometer.getRate()).toBe(0)
    })

    it('constant speed', () => {
        for (let second = 0; second < WINDOW_SIZE_IN_SECONDS; second++) {
            for (let fraction = 0; fraction < 1000; fraction += 100) {
                currentTimeProvider.set(`2000-01-02T03:04:0${second}.${fraction}Z`)
                speedometer.record(2)
            }
        }
        currentTimeProvider.set(`2000-01-02T03:04:05.100Z`)
        speedometer.record(2)
        currentTimeProvider.set(`2000-01-02T03:04:05.200Z`)
        speedometer.record(2)
        expect(speedometer.getRate()).toBe(20)
    })

    it('all item types', () => {
        currentTimeProvider.set('2000-01-02T03:04:04.999Z')
        speedometer.record(999)
        currentTimeProvider.set('2000-01-02T03:04:05.222Z')
        speedometer.record(123)
        currentTimeProvider.set('2000-01-02T03:04:06.111Z')
        speedometer.record(456)
        currentTimeProvider.set('2000-01-02T03:04:07.333Z')
        speedometer.record(789)
        currentTimeProvider.set('2000-01-02T03:04:08.444Z')
        speedometer.record(222)
        currentTimeProvider.set('2000-01-02T03:04:09.222Z')
        speedometer.record(333)
        currentTimeProvider.set('2000-01-02T03:04:10.333Z')
        speedometer.record(444)
        currentTimeProvider.set('2000-01-02T03:04:10.600Z')
        expect(speedometer.getRate()).toBeCloseTo((123 * 0.4 + 456 + 789 + 222 + 333 + 444) / WINDOW_SIZE_IN_SECONDS)
    })

    describe('soon after startup', () => {

        it('empty', () => {
            currentTimeProvider.set('2000-01-02T00:00:00.200Z')
            expect(speedometer.getRate()).toBe(0)
        })
    
        it('before 1 sec', () => {
            currentTimeProvider.set('2000-01-02T00:00:01.100Z')
            speedometer.record(100)
            expect(speedometer.getRate()).toBe(100)
        })

        it('before 2 sec', () => {
            currentTimeProvider.set('2000-01-02T00:00:02.200Z')
            speedometer.record(100)
            expect(speedometer.getRate()).toBe(50)
        })
    })
})