interface Bucket {
    slot: number
    bytes: number
}

/**
 * Bytes-per-second over a sliding window, kept as a ring of fixed-width
 * buckets. `record()` never allocates and `getBytesPerSecond()` is a sum over
 * the ring, so it is cheap enough to call on every message and on every
 * statistics tick. The clock is injectable for deterministic tests.
 *
 * The reported rate covers the last `bucketCount` bucket slots including the
 * current (partial) one, i.e. between `windowMs - bucketMs` and `windowMs`
 * of history, divided by the full window.
 */
export class ByteRateEstimator {

    private readonly windowMs: number
    private readonly bucketMs: number
    private readonly buckets: Bucket[]
    private readonly now: () => number

    constructor(windowMs = 1000, bucketCount = 10, now: () => number = Date.now) {
        this.windowMs = windowMs
        this.bucketMs = windowMs / bucketCount
        this.buckets = []
        for (let i = 0; i < bucketCount; i++) {
            this.buckets.push({ slot: -1, bytes: 0 })
        }
        this.now = now
    }

    record(bytes: number): void {
        const slot = this.currentSlot()
        const bucket = this.buckets[slot % this.buckets.length]
        if (bucket.slot !== slot) {
            bucket.slot = slot
            bucket.bytes = 0
        }
        bucket.bytes += bytes
    }

    getBytesPerSecond(): number {
        const oldestSlot = this.currentSlot() - this.buckets.length + 1
        let sum = 0
        for (const bucket of this.buckets) {
            if (bucket.slot >= oldestSlot) {
                sum += bucket.bytes
            }
        }
        return Math.round(sum / (this.windowMs / 1000))
    }

    reset(): void {
        for (const bucket of this.buckets) {
            bucket.slot = -1
            bucket.bytes = 0
        }
    }

    private currentSlot(): number {
        return Math.floor(this.now() / this.bucketMs)
    }
}
