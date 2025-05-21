export function sum(values: bigint[]): bigint {
    return values.reduce((acc, value) => acc + value, 0n)
}
