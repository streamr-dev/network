export const ipv4ToNumber = (ip: string): number => {
    const octets = ip.split('.').map(Number)
    return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
}

export const numberToIpv4 = (value: number): string => {
    const octets = [24, 16, 8, 0].map((shift) => (value >> shift) & 255)
    return octets.join('.')
}
