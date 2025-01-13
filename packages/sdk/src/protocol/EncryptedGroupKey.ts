export class EncryptedGroupKey {
    readonly id: string
    readonly data: Uint8Array

    constructor(id: string, data: Uint8Array) {
        this.id = id
        this.data = data
    }
}
