import { v4 } from 'uuid'

export default function uuidv4(...args) {
    if (process.env.WEB_BUILD && typeof window === 'undefined') {
        // Make it an empty string in a "web" environment that does not define the `window` object.
        // Mainly aimed at server-side rendered react apps.
        return ''
    }

    return v4(...args)
}
