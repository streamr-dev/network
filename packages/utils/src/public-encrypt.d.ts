declare module 'public-encrypt' {
    export function publicEncrypt(key: string, msg: Uint8Array): Buffer
    export function privateDecrypt(key: string, enc: Uint8Array): Buffer
    export function privateEncrypt(key: string, buf: Uint8Array): Buffer
    export function publicDecrypt(key: string, buf: Uint8Array): Buffer
}
