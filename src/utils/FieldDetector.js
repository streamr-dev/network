export default class FieldDetector {
    message = null

    constructor(message) {
        this.message = message
    }

    detect() {
        if (this.message == null) {
            throw new Error('Invalid message provided to FieldDetector constructor')
        }

        const content = this.message
        const fields = []

        Object.keys(content).forEach((key) => {
            let type
            if (Array.isArray(content[key])) {
                type = 'list'
            } else if ((typeof content[key]) === 'object') {
                type = 'map'
            } else {
                type = typeof content[key]
            }
            fields.push({
                name: key,
                type,
            })
        })

        return fields
    }
}
