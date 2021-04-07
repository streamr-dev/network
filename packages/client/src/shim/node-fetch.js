// NB: THIS FILE MUST BE IN ES5

// In browsers, the node-fetch package is replaced with this to use native fetch
export default typeof fetch !== 'undefined' ? fetch : window.fetch
