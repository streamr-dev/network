import { StreamID } from './StreamID'
import { EthereumAddress } from './types'

export class KeyExchangeStreamIDUtils {

    static STREAM_ID_PREFIX = 'SYSTEM/keyexchange/'

    static formKeyExchangeStreamID(recipient: EthereumAddress): StreamID {
        return (KeyExchangeStreamIDUtils.STREAM_ID_PREFIX + recipient.toLowerCase()) as StreamID
    }
    
    static isKeyExchangeStream(streamId: StreamID | string): boolean {
        return streamId.startsWith(KeyExchangeStreamIDUtils.STREAM_ID_PREFIX)
    }
    
    static getRecipient(streamId: StreamID): EthereumAddress | undefined {
        if (KeyExchangeStreamIDUtils.isKeyExchangeStream(streamId)) {
            return streamId.substring(KeyExchangeStreamIDUtils.STREAM_ID_PREFIX.length)
        }
        return undefined
    }
}