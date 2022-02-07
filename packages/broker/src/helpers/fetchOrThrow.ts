import fetch, { RequestInit, Response } from 'node-fetch'
import timeoutSignal from 'timeout-signal'

const DEFAULT_TIMEOUT = 30 * 1000

export const fetchOrThrow = async (url: string, init?: RequestInit): Promise<Response> => {
    const res = await fetch(url, {
        signal: timeoutSignal(DEFAULT_TIMEOUT),
        ...init
    })
    if (res.ok) {
        return res
    } else {
        throw new Error(`request to ${url} failed, response: ${res.status} ${res.statusText}`)
    }
}
