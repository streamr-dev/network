import { validateIsNotNullOrUndefined } from '../../../utils/validations'
import TrackerMessage, { TrackerMessageOptions } from '../TrackerMessage'

export interface Options extends TrackerMessageOptions {
    status: any
}

export default class StatusMessage extends TrackerMessage {

    status: any

    constructor({ version = TrackerMessage.LATEST_VERSION, requestId, status }: Options) {
        super(version, TrackerMessage.TYPES.StatusMessage, requestId)

        validateIsNotNullOrUndefined('status', status)

        this.status = status
    }
}
