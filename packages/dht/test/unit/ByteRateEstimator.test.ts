import { ByteRateEstimator } from '../../src/helpers/ByteRateEstimator'

describe('ByteRateEstimator', () => {

    let now: number
    const clock = () => now

    beforeEach(() => {
        now = 10_000
    })

    it('reports 0 when nothing was recorded', () => {
        const estimator = new ByteRateEstimator(1000, 10, clock)
        expect(estimator.getBytesPerSecond()).toBe(0)
    })

    it('sums records inside the window', () => {
        const estimator = new ByteRateEstimator(1000, 10, clock)
        estimator.record(300)
        now += 250
        estimator.record(200)
        now += 250
        estimator.record(500)
        expect(estimator.getBytesPerSecond()).toBe(1000)
    })

    it('drops records that fall out of the window', () => {
        const estimator = new ByteRateEstimator(1000, 10, clock)
        estimator.record(1000)
        now += 500
        estimator.record(400)
        expect(estimator.getBytesPerSecond()).toBe(1400)
        now += 600   // the first record is now 1.1 s old
        expect(estimator.getBytesPerSecond()).toBe(400)
        now += 600   // everything expired
        expect(estimator.getBytesPerSecond()).toBe(0)
    })

    it('reuses ring buckets after a wrap-around without leaking old bytes', () => {
        const estimator = new ByteRateEstimator(1000, 10, clock)
        estimator.record(1000)
        now += 5000   // same ring index as the first record, 5 s later
        estimator.record(10)
        expect(estimator.getBytesPerSecond()).toBe(10)
    })

    it('scales to the window length', () => {
        const estimator = new ByteRateEstimator(2000, 4, clock)
        estimator.record(1000)
        now += 1500
        estimator.record(1000)
        expect(estimator.getBytesPerSecond()).toBe(1000)
    })

    it('reset() clears everything', () => {
        const estimator = new ByteRateEstimator(1000, 10, clock)
        estimator.record(1000)
        estimator.reset()
        expect(estimator.getBytesPerSecond()).toBe(0)
    })
})
