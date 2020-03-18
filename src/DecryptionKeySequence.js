import EncryptionUtil from './EncryptionUtil'
import UnableToDecryptError from './errors/UnableToDecryptError'

export default class DecryptionKeySequence {
    constructor(keys) {
        this.keys = keys
        this.currentIndex = 0
    }

    tryToDecryptResent(msg) {
        try {
            EncryptionUtil.decryptStreamMessage(msg, this.keys[this.currentIndex])
        } catch (err) {
            // the current might not be valid anymore
            if (err instanceof UnableToDecryptError) {
                const nextKey = this._getNextKey()
                if (!nextKey) {
                    throw err
                }
                // try to decrypt with the next key
                EncryptionUtil.decryptStreamMessage(msg, nextKey)
                // if successful (no error thrown) update the current key
                this.currentIndex += 1
            } else {
                throw err
            }
        }
    }

    _getNextKey() {
        if (this.currentIndex === this.keys.length - 1) {
            return undefined
        }
        return this.keys[this.currentIndex + 1]
    }
}
