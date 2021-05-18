export default function parse(millisOrString: number | string): number | never {
    if (typeof millisOrString === 'number') {
        return millisOrString
    }

    const timestamp = Number(millisOrString) || Date.parse(millisOrString)

    if (Number.isInteger(timestamp)) {
        return timestamp
    }

    throw new Error(`Invalid timestamp: ${millisOrString}`)
}

export { parse }
