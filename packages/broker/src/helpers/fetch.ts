import fetch, { RequestInit, Response } from 'node-fetch'

export const fetchOrThrow = async (url: string, init?: RequestInit): Promise<Response> => {
    const res = await fetch(url, init)
    if (res.ok) {
        return res
    } else {
        throw new Error(`request to ${url} failed, response: ${res.status} ${res.statusText}`)
    }
}
