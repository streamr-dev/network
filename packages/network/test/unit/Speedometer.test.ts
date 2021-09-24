import { Speedometer } from '../../src/helpers/Speedometer'

const WINDOW_SIZE_IN_SECONDS = 5

const createMockCurrentTimeProvider = (): (() => number) & { set: (dateStr: string) => void } => {
    let now: number
    const fn = () => now
    fn.set = (dateStr: string) => now = new Date(dateStr).getTime()
    return fn
}

const STARTUP_TIME = '2000-01-02T00:00:00.123Z' 

describe('Speedometer', () => {

    let speedometer: Speedometer
    const currentTimeProvider = createMockCurrentTimeProvider()

    beforeEach(() => {
        currentTimeProvider.set(STARTUP_TIME)
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
        // 12.3% of the current second have been elapsed -> the same amount of recorded data has expired
        expect(speedometer.getRate()).toBeCloseTo((100 - 12.3) / WINDOW_SIZE_IN_SECONDS)
    })

    it('get partially expired: data too old but within same UTC second', () => {
        currentTimeProvider.set('2000-01-02T03:04:05.678Z')
        speedometer.record(100)
        currentTimeProvider.set('2000-01-02T03:04:10.888Z')
        // 88.8% of the current second have been elapsed -> the same amount of recorded data has expired
        // the recorded item is actually 5.21 seconds old, but we calculate all items from the 03:04:05 sec
        // unit that sec has fully expired (at 03:04:11.000)
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

    describe('during warmup', () => {

        it('empty', () => {
            currentTimeProvider.set('2000-01-02T00:00:00.200Z')
            expect(speedometer.getRate()).toBe(0)
        })
    
        describe.each([
            [0.9, 100],
            [2.4, 50],
            [3.6, 25]
        ])('after n seconds', (seconds: number, expectedRate: number) => {
            it(String(seconds), () => {
                const now = Date.parse(STARTUP_TIME) + seconds * 1000
                currentTimeProvider.set(new Date(now).toISOString())
                speedometer.record(100)
                expect(speedometer.getRate()).toBe(expectedRate)
            })
        })
    })
})