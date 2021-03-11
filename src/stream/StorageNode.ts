import { EthereumAddress } from '../types'

export default class StorageNode {
    _address: EthereumAddress
    constructor(address: EthereumAddress) {
        this._address = address
    }

    getAddress() {
        return this._address
    }
}
