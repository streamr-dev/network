// In browsers, the node-fetch package is replaced with this to use native fetch

if (typeof fetch !== 'undefined') {
    module.exports = fetch
} else {
    module.exports = window.fetch
}
