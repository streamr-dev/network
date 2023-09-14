// this precision is big enough as we typically handle bigints which are in weis (the smallest denomination of Ethereum)
const PRECISION = 1e18

export const multiply = (val1: bigint, val2: number): bigint => {
    return val1 * BigInt(PRECISION * val2) / BigInt(PRECISION)
}
