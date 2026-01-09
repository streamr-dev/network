declare module 'browserify-aes' {
    import type { Transform } from 'readable-stream'

    export interface CipherOptions {
        iv?: Buffer | Uint8Array | null
        authTagLength?: number
    }

    export interface DecipherOptions {
        iv?: Buffer | Uint8Array | null
        authTagLength?: number
    }

    export function createCipher(
        algorithm: string,
        password: string | Buffer
    ): Transform

    export function createCipheriv(
        algorithm: string,
        key: Buffer | Uint8Array,
        iv: Buffer | Uint8Array | null,
        options?: CipherOptions
    ): Transform

    export function createDecipher(
        algorithm: string,
        password: string | Buffer
    ): Transform

    export function createDecipheriv(
        algorithm: string,
        key: Buffer | Uint8Array,
        iv: Buffer | Uint8Array | null,
        options?: DecipherOptions
    ): Transform

    export function getCiphers(): string[]
}

declare module 'browserify-aes/modes' {
    const modes: Record<string, any>
    export default modes
}
