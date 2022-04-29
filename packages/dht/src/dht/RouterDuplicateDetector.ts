import { BloomFilter } from 'bloomfilter'

// Link for calculating false positive probabilities
// https://www.di-mgt.com.au/bloom-calculator.html
export class RouterDuplicateDetector {
    currentFilter: BloomFilter
    nextFilter: BloomFilter | null
    counter: number

    constructor(
        private numOfBits: number,
        private numOfHashFunctions: number,
        private nextFilterFillingLimit: number,
        private resetLimit: number
    ) {
        this.currentFilter = new BloomFilter(numOfBits, numOfHashFunctions)
        this.nextFilter = null
        this.counter = 0
    }

    add(value: string): void {
        if (this.nextFilter === null
            && this.counter >= this.nextFilterFillingLimit
            && this.counter < this.resetLimit
        ) {
            this.nextFilter = new BloomFilter(this.numOfBits, this.numOfHashFunctions)
        } else if (this.counter >= this.resetLimit) {
            this.counter = 0
            this.currentFilter = this.nextFilter!
            this.nextFilter = null
        }
        this.currentFilter.add(value)
        if (this.nextFilter) {
            this.nextFilter.add(value)
        }
        this.counter += 1
    }

    test(value: string): boolean {
        return this.currentFilter.test(value)
    }

}

