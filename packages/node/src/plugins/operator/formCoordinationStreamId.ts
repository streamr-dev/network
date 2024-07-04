import { EthereumAddress, StreamID, toStreamID } from '@streamr/utils'

export function formCoordinationStreamId(operatorContractAddress: EthereumAddress): StreamID {
    return toStreamID('/operator/coordination', operatorContractAddress)
}
