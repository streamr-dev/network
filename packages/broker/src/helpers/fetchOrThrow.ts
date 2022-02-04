import fetch, { RequestInit, Response } from 'node-fetch'

const DEFAULT_TIMEOUT = 30 * 1000

export const fetchOrThrow = async (url: string, init?: RequestInit): Promise<Response> => {
    const res = await fetch(url, {
        timeout: DEFAULT_TIMEOUT,
        ...init
    })
    if (res.ok) {
        return res
    } else {
        throw new Error(`request to ${url} failed, response: ${res.status} ${res.statusText}`)
    }
}
