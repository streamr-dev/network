export default class StorageNode {
    _address: string
    constructor(address: string) {
        this._address = address
    }

    getAddress() {
        return this._address
    }
}
