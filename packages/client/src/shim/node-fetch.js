
// In browsers, the node-fetch package is replaced with this to use native fetch
export default (
    (typeof fetch !== 'undefined' && fetch) || (typeof window !== 'undefined' && window.fetch) || undefined
)
