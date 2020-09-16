import { v4 as uuidv4 } from 'uuid'
import uniqueId from 'lodash.uniqueid'
import LRU from 'quick-lru'
import pMemoize from 'p-memoize'
import mem from 'mem'

import pkg from '../package.json'

const UUID = uuidv4()

export function uuid(label = '') {
    return uniqueId(`${UUID}${label ? `.${label}` : ''}`) // incrementing + human readable uuid
}

export function getVersionString() {
    const isProduction = process.env.NODE_ENV === 'production'
    return `${pkg.version}${!isProduction ? 'dev' : ''}`
}

/**
 * Converts a .once event listener into a promise.
 * Rejects if an 'error' event is received before resolving.
 */

export function waitFor(emitter, event) {
    return new Promise((resolve, reject) => {
        let onError
        const onEvent = (value) => {
            emitter.off('error', onError)
            resolve(value)
        }
        onError = (error) => {
            emitter.off(event, onEvent)
            reject(error)
        }

        emitter.once(event, onEvent)
        emitter.once('error', onError)
    })
}

export const getEndpointUrl = (baseUrl, ...pathParts) => {
    return baseUrl + '/' + pathParts.map((part) => encodeURIComponent(part)).join('/')
}

/* eslint-disable object-curly-newline */
export function CacheAsyncFn(fn, {
    maxSize = 10000,
    maxAge = 30 * 60 * 1000, // 30 minutes
    cachePromiseRejection = false,
} = {}) {
    const cachedFn = pMemoize(fn, {
        maxAge,
        cachePromiseRejection,
        cache: new LRU({
            maxSize,
        })
    })
    cachedFn.clear = () => pMemoize.clear(cachedFn)
    return cachedFn
}

export function CacheFn(fn, {
    maxSize = 10000,
    maxAge = 30 * 60 * 1000, // 30 minutes
} = {}) {
    const cachedFn = mem(fn, {
        maxAge,
        cache: new LRU({
            maxSize,
        })
    })
    cachedFn.clear = () => mem.clear(cachedFn)
    return cachedFn
}
/* eslint-enable object-curly-newline */
