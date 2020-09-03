import { validateIsNotNullOrUndefined } from '../../../utils/validations'
import TrackerMessage from '../TrackerMessage'

export default class StatusMessage extends TrackerMessage {
    constructor({ version = TrackerMessage.LATEST_VERSION, requestId, status }) {
        super(version, TrackerMessage.TYPES.StatusMessage, requestId)

        validateIsNotNullOrUndefined('status', status)

        this.status = status
    }
}
