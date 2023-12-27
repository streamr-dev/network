import { EthereumAddress } from '@streamr/utils'
import { StreamID, toStreamID } from '@streamr/protocol'

export function formCoordinationStreamId(operatorContractAddress: EthereumAddress): StreamID {
    return toStreamID('/operator/coordination', operatorContractAddress)
}
