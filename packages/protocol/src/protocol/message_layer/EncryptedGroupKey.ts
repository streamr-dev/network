import { validateIsString, validateIsType } from '../../utils/validations'

export default class EncryptedGroupKey {

    readonly groupKeyId: string
    readonly data: Uint8Array

    constructor(groupKeyId: string, data: Uint8Array) {
        validateIsString('groupKeyId', groupKeyId)
        this.groupKeyId = groupKeyId

        validateIsType('data', data, 'Uint8Array', Uint8Array)
        this.data = data
    }
}
