interface WebCrypto {
    new (): Crypto
    (): Crypto
}

const WebCryptoFn: WebCrypto = function WebCrypto() {
    return window.crypto
} as WebCrypto

export { WebCryptoFn as Crypto }
