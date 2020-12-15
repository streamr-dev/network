import {
    validateIsNotEmptyString,
    validateIsNotNullOrUndefined,
} from '../../../utils/validations'
import TrackerMessage from '../TrackerMessage'

export default class RelayMessage extends TrackerMessage {
    constructor({
        version = TrackerMessage.LATEST_VERSION,
        requestId,
        originator,
        targetNode,
        subType,
        data
    }) {
        super(version, TrackerMessage.TYPES.RelayMessage, requestId)

        validateIsNotNullOrUndefined('originator', originator)
        validateIsNotEmptyString('targetNode', targetNode)
        validateIsNotEmptyString('subType', subType)
        validateIsNotNullOrUndefined('data', data)

        this.originator = originator
        this.targetNode = targetNode
        this.subType = subType
        this.data = data
    }
}
