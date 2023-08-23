import random from 'lodash/random'

/**
 * Returns a random item from the given array, where the weight of each item is
 * determined by the given weight function.
 *
 * @param items The items to sample from
 * @param weight The weight function, should return a positive integer (strictly greater than zero)
 * @returns The sampled item, or undefined if the array is empty
 *
 */
export function weightedSample<T>(items: T[], weight: (t: T) => number): T | undefined {
    if (items.length === 0) {
        return undefined
    }

    const cumulativeWeights = [weight(items[0])]
    for (let i = 1; i < items.length; ++i) {
        cumulativeWeights[i] = cumulativeWeights[i - 1] + weight(items[i])
    }

    const sample = random(0, cumulativeWeights[cumulativeWeights.length - 1] - 1)

    for (let i = 0; i < cumulativeWeights.length; ++i) {
        if (cumulativeWeights[i] > sample) {
            return items[i]
        }
    }
    throw new Error('assertion failure: should never be here')
}
