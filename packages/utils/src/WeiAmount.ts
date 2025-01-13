export type WeiAmount = bigint

const PRECISION = 1e18

export const multiplyWeiAmount = (val1: WeiAmount, val2: number): WeiAmount => {
    return (val1 * BigInt(PRECISION * val2)) / BigInt(PRECISION)
}
