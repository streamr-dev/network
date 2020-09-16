const decode = (serializedMessage, deserializeFn) => {
    try {
        return deserializeFn(serializedMessage)
    } catch (e) {
        if (e.name === 'SyntaxError' || e.version != null || e.type != null) { // JSON parsing failed, version parse failed, type parse failed
            return null
        }
        throw e
    }
}

module.exports = {
    decode,
}
