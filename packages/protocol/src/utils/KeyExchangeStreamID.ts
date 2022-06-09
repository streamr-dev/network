import { StreamID } from './StreamID'
import { StreamPartID, toStreamPartID } from './StreamPartID'
import { EthereumAddress } from './types'

export class KeyExchangeStreamIDUtils {

    static STREAM_ID_PREFIX = 'SYSTEM/keyexchange/'
    static PARTITION = 0

    static formStreamPartID(recipient: EthereumAddress): StreamPartID {
        const streamId = (KeyExchangeStreamIDUtils.STREAM_ID_PREFIX + recipient.toLowerCase()) as StreamID
        return toStreamPartID(streamId, KeyExchangeStreamIDUtils.PARTITION)
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