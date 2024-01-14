import { validateIsString, validateIsType } from '../../utils/validations'

export default class EncryptedGroupKey {

    readonly id: string
    readonly data: Uint8Array

    constructor(id: string, data: Uint8Array) {
        validateIsString('id', id)
        this.id = id

        validateIsType('data', data, 'Uint8Array', Uint8Array)
        this.data = data
    }
}
