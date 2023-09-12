const PRECISSION = 1e18

export const multiply = (val1: bigint, val2: number): bigint => {
    return val1 * BigInt(PRECISSION * val2) / BigInt(PRECISSION)
}
