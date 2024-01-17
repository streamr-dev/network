export interface ISigningModule {
    hash(data: Uint8Array): Uint8Array
    sign(data: Uint8Array): Uint8Array
}
