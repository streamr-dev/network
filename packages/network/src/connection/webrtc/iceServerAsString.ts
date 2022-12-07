import { IceServer } from './WebRtcConnection'

export function iceServerAsString({ url, port, username, password }: IceServer): string {
    const [protocol, hostname] = url.split(':')
    if (hostname === undefined) {
        throw new Error(`invalid stun/turn format: ${url}`)
    }
    if (username === undefined && password === undefined) {
        return `${protocol}:${hostname}:${port}`
    }
    if (username !== undefined && password !== undefined) {
        return `${protocol}:${username}:${password}@${hostname}:${port}`
    }
    throw new Error(`username (${username}) and password (${password}) must be supplied together`)
}
