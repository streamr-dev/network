import ipaddr from 'ipaddr.js'

// IPv4 private address ranges as specified by RFC 1918
// and private loopback addresses
const IPv4PrivateRanges = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8'].map((a) =>
    ipaddr.parseCIDR(a)
)

export function isPrivateIPv4(address: string): boolean {
    if (ipaddr.IPv4.isValid(address)) {
        const ip = ipaddr.IPv4.parse(address)
        for (const range of IPv4PrivateRanges) {
            if (ip.match(range)) {
                return true
            }
        }
    }

    return false
}

export function getAddressFromIceCandidate(candidate: string): string | undefined {
    const fields = candidate.split(' ').filter((field) => field.length > 0)
    return fields.length >= 5 && ipaddr.isValid(fields[4]) ? fields[4] : undefined
}
