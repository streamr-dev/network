import { BloomFilter } from 'bloomfilter'

// Link for calculating false positive probabilities
// https://www.di-mgt.com.au/bloom-calculator.html
export class DuplicateDetector {
    currentFilter: BloomFilter
    nextFilter?: BloomFilter
    counter: number
    private numOfHashFunctions: number
    private numOfBits: number
    private nextFilterFillingLimit: number
    private resetLimit: number

    // False positives at 0.05% at maximum capacity with default values
    constructor(
        numOfBits = 2 ** 15,
        numOfHashFunctions = 16,
        nextFilterFillingLimit = 1050,
        resetLimit = 2100
    ) {
        this.currentFilter = new BloomFilter(numOfBits, numOfHashFunctions)
        this.counter = 0
        this.numOfHashFunctions = numOfHashFunctions
        this.numOfBits = numOfBits
        this.nextFilterFillingLimit = nextFilterFillingLimit
        this.resetLimit = resetLimit
    }

    add(value: string): void {
        if (!this.nextFilter
            && this.counter >= this.nextFilterFillingLimit
            && this.counter < this.resetLimit
        ) {
            this.nextFilter = new BloomFilter(this.numOfBits, this.numOfHashFunctions)
        } else if (this.counter >= this.resetLimit) {
            this.counter = 0
            this.currentFilter = this.nextFilter!
            this.nextFilter = undefined
        }
        this.currentFilter.add(value)
        if (this.nextFilter) {
            this.nextFilter.add(value)
        }
        this.counter += 1
    }

    isMostLikelyDuplicate(value: string): boolean {
        return this.currentFilter.test(value)
    }

}

