// NB: THIS FILE MUST BE IN ES5

// In browsers, the node-fetch package is replaced with this to use native fetch

if (typeof fetch !== 'undefined') {
    module.exports = fetch
} else {
    module.exports = window.fetch
}
