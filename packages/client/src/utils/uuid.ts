import { v4 as uuidv4 } from 'uuid'
import uniqueId from 'lodash/uniqueId'

export const SEPARATOR = '-'

let UUID: string

export default function uuid(label = ''): string {
    if (typeof UUID === 'undefined') {
        // Create UUID on the first use of the function in order to avoid premature `uuidv4` calls.
        // Doing it outside will break browser projects that utilize server-side rendering (no
        // `window` while build's target is `web`).
        UUID = uuidv4()
    }

    // Incrementing + human readable uuid
    return uniqueId(`${UUID}${label ? `${SEPARATOR}${label}` : ''}`)
}
