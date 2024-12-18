const PRECISION = 1e18

export const multiplyWeiAmount = (val1: bigint, val2: number): bigint => {
    return val1 * BigInt(PRECISION * val2) / BigInt(PRECISION)
}
