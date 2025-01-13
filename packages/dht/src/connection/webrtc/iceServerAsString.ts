import { IceServer } from './WebrtcConnector'

export function iceServerAsString({ url, port, username, password, tcp }: IceServer): string {
    const [protocol, hostname] = url.split(':')
    if (hostname === undefined) {
        throw new Error(`invalid stun/turn format: ${url}`)
    }
    if (username === undefined && password === undefined) {
        return `${protocol}:${hostname}:${port}`
    }
    if (username !== undefined && password !== undefined) {
        return `${protocol}:${username}:${password}@${hostname}:${port}${tcp !== undefined ? '?transport=tcp' : ''}`
    }
    throw new Error(`username (${username}) and password (${password}) must be supplied together`)
}
