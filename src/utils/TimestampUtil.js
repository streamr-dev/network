module.exports = {
    parse: (millisOrString) => {
        if (typeof millisOrString === 'number') {
            return millisOrString
        } else if (typeof millisOrString === 'string') {
            // Try if this string represents a number
            const timestamp = Number(millisOrString) || Date.parse(millisOrString)
            if (Number.isNaN(timestamp)) {
                throw new Error(`Invalid timestamp: ${millisOrString}`)
            } else {
                return timestamp
            }
        } else {
            throw new Error(`Invalid timestamp: ${millisOrString}`)
        }
    },
}
