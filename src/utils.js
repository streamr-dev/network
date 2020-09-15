import Receptacle from 'receptacle'
import { v4 as uuidv4 } from 'uuid'
import uniqueId from 'lodash.uniqueid'

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

export class AsyncCacheMap {
    /* eslint-disable object-curly-newline */
    constructor(fn, {
        max = 10000,
        ttl = 30 * 60 * 1000, // 30 minutes
        refresh = true, // reset ttl on access
    } = {}) {
        /* eslint-disable-next-line object-curly-newline */
        this.ttl = ttl
        this.refresh = refresh
        this.fn = fn
        this.cache = new Receptacle({
            max,
        })
    }

    load(id, { ttl = this.ttl, refresh = this.refresh, } = {}) {
        if (!this.cache.get(id)) {
            const promise = this.fn(id)
            const success = this.cache.set(id, promise, {
                ttl,
                refresh,
            })
            if (!success) {
                console.warn(`Could not store ${id} in local cache.`)
                return promise
            }
        }
        return this.cache.get(id)
    }

    stop() {
        this.cache.clear()
    }
}

export function AsyncCacheFn(fn, options) {
    const cache = new AsyncCacheMap(fn, options)
    const cacheFn = async (opts) => {
        return cache.load('value', opts)
    }
    cacheFn.cache = cache
    cacheFn.stop = () => {
        return cache.stop()
    }
    return cacheFn
}
