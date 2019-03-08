/**
 * Represent a pair of numbers (a,b). Ordering between two pairs is defined as
 * follows. First compare first numbers. Compare second numbers if first are
 * equal.
 */
class NumberPair {
    constructor(a, b) {
        this.a = a
        this.b = b
    }

    greaterThanOrEqual(otherPair) {
        return this.greaterThan(otherPair) || this.equalTo(otherPair)
    }

    greaterThan(otherPair) {
        return this._compareTo(otherPair) === 1
    }

    equalTo(otherPair) {
        return this._compareTo(otherPair) === 0
    }

    _compareTo(otherPair) {
        if (this.a > otherPair.a) {
            return 1
        }
        if (this.a < otherPair.a) {
            return -1
        }
        if (this.b > otherPair.b) {
            return 1
        }
        if (this.b < otherPair.b) {
            return -1
        }
        return 0
    }

    toString() {
        return `${this.a}|${this.b}`
    }
}

class GapMisMatchError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, GapMisMatchError) // exclude this constructor from stack trace
    }
}

/**
 *
 * Keeps track of a stream's message numbers and reports already seen numbers
 * as duplicates.
 *
 * Leverages the fact that message are assigned numbers from a strictly
 * increasing integer sequence for lowered space complexity. For example,
 * if we know that all messages up to number N have been seen, we can only
 * store the number N to provide message identity check. This is because
 * anything less than N can be deemed a duplicate.
 *
 * Messages arriving out-of-order makes this a bit harder since gaps form.
 * Most of the code in this class is built to deal with this complexity.
 * Basically, we need to keep track of which intervals [N,M] could still
 * contain unseen messages. We should also remove intervals after we are sure
 * that they contain no unseen messages.
 *
 * In addition to the above, there needs to be a limit to the number of
 * intervals we store, as it could well be that some messages never
 * arrive. The strategy is to start removing the lowest numbered
 * intervals when storage limits are hit.
 *
 */
class DuplicateMessageDetector {
    constructor(maxNumberOfGaps = 10000) {
        this.maxNumberOfGaps = maxNumberOfGaps
        this.gaps = [] // ascending order of half-closed intervals (x,y] representing gaps that contain unseen message(s)
    }

    /**
     * returns true if number has not yet been seen (i.e. is not a duplicate)
     */
    markAndCheck(previousNumber, number) {
        if (previousNumber && previousNumber.greaterThanOrEqual(number)) {
            throw new Error('pre-condition: previousNumber < number')
        }

        if (this.gaps.length === 0) {
            this.gaps.push([number, new NumberPair(Infinity, Infinity)])
            return true
        }

        // Handle special case where previousNumber is not provided. Only
        // minimal duplicate detection is provided (comparing against latest
        // known message number).
        if (previousNumber === null) {
            if (number.greaterThan(this.gaps[this.gaps.length - 1][0])) {
                this.gaps[this.gaps.length - 1][0] = number
                return true
            }
            return false
        }

        for (let i = this.gaps.length - 1; i >= 0; --i) {
            const [lowerBound, upperBound] = this.gaps[i] // invariant: upperBound > lowerBound

            // implies number > upperBound (would've been handled in previous iteration if gap exists)
            if (previousNumber.greaterThanOrEqual(upperBound)) {
                return false
            }
            if (previousNumber.greaterThanOrEqual(lowerBound)) {
                if (number.greaterThan(upperBound)) {
                    throw new GapMisMatchError('pre-condition: gap overlap in given numbers')
                }
                if (previousNumber.equalTo(lowerBound)) {
                    if (number.equalTo(upperBound)) {
                        this.gaps.splice(i, 1)
                    } else {
                        this.gaps[i] = [number, upperBound]
                    }
                } else if (number.equalTo(upperBound)) {
                    this.gaps[i] = [lowerBound, previousNumber]
                } else {
                    this.gaps.splice(i, 1, [lowerBound, previousNumber], [number, upperBound])
                }

                // invariants after:
                //   - gaps are in ascending order
                //   - the intersection between any two gaps is empty
                //   - there are no gaps that define the empty set
                //   - last gap is [n, Infinity]
                //   - anything not covered by a gap is considered seen

                this._dropLowestGapIfOverMaxNumberOfGaps()
                return true
            }
            if (number.greaterThan(lowerBound)) {
                throw new GapMisMatchError('pre-condition: gap overlap in given numbers')
            }
        }
        return false
    }

    _dropLowestGapIfOverMaxNumberOfGaps() {
        // invariant: this.gaps.length <= this.maxNumberOfGaps + 1
        if (this.gaps.length > this.maxNumberOfGaps) {
            this.gaps.shift()
        }
    }

    toString() {
        return this.gaps.map(([lower, upper]) => `(${lower}, ${upper}]`).join(', ')
    }
}

module.exports = {
    NumberPair,
    GapMisMatchError,
    DuplicateMessageDetector
}
