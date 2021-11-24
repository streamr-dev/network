type FetchResponse = Response
// In browsers, the node-fetch package is replaced with this to use native fetch
export default (
    ((typeof window !== 'undefined' && window.fetch.bind(window)) || (typeof fetch !== 'undefined' && fetch) || undefined)!
)

export { FetchResponse as Response }
