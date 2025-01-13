import crypto from 'crypto'

/**
 * Computes a deterministic index for a given string or number key.
 * Used for deterministically selecting an entry from an ordered list
 * for various load balancing and partitioning purposes.
 *
 * @param lengthOfArray Number of items to select from
 * @param key Input string or number
 * @returns Array index between [0..lengthOfArray-1]
 */
export function keyToArrayIndex(lengthOfArray: number, key: string | number): number {
    if (!(Number.isSafeInteger(lengthOfArray) && lengthOfArray > 0)) {
        throw new Error(`lengthOfArray is not a safe positive integer! ${lengthOfArray}`)
    }

    if (lengthOfArray === 1) {
        // Fast common case
        return 0
    }

    // Number key handling
    if (typeof key === 'number') {
        return Math.abs(key) % lengthOfArray
    }

    // String key handling
    const buffer = crypto.createHash('md5').update(key).digest()
    const intHash = buffer.readInt32LE(0)
    return Math.abs(intHash) % lengthOfArray
}
