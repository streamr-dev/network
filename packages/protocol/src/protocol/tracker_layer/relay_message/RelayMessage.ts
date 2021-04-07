import {
    validateIsNotEmptyString,
    validateIsNotNullOrUndefined,
} from '../../../utils/validations'
import TrackerMessage, { TrackerMessageOptions } from '../TrackerMessage'
import { Originator } from "../Originator"

export interface Options extends TrackerMessageOptions {
    originator: Originator,
    targetNode: string,
    subType: string,
    data: any
}

export default class RelayMessage extends TrackerMessage {
    originator: Originator
    targetNode: string
    subType: string
    data: any

    constructor({ version = TrackerMessage.LATEST_VERSION, requestId, originator, targetNode, subType, data }: Options) {
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
