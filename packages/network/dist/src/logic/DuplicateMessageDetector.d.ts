/**
 * Represent a pair of numbers (a,b). Ordering between two pairs is defined as
 * follows. First compare first numbers. Compare second numbers if first are
 * equal.
 */
export declare class NumberPair {
    private readonly a;
    private readonly b;
    constructor(a: number, b: number);
    greaterThanOrEqual(otherPair: NumberPair): boolean;
    greaterThan(otherPair: NumberPair): boolean;
    equalTo(otherPair: NumberPair): boolean;
    private compareTo;
    toString(): string;
}
export declare class InvalidNumberingError extends Error {
    constructor();
}
export declare class GapMisMatchError extends Error {
    constructor(state: string, previousNumber: NumberPair, number: NumberPair);
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
export declare class DuplicateMessageDetector {
    private readonly maxNumberOfGaps;
    private readonly gaps;
    constructor(maxNumberOfGaps?: number);
    /**
     * returns true if number has not yet been seen (i.e. is not a duplicate)
     */
    markAndCheck(previousNumber: NumberPair | null, number: NumberPair): boolean | never;
    private dropLowestGapIfOverMaxNumberOfGaps;
    toString(): string;
}
