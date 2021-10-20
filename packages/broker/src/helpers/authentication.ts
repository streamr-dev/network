import { Headers } from 'node-fetch'

export const formAuthorizationHeader = (sessionToken: string | null | undefined): Headers => {
    const headers: Headers = new Headers()
    if (sessionToken) {
        headers.set('Authorization', `Bearer ${sessionToken}`)
    }
    return headers
}