const isTimestampTooFarInTheFuture = (timestamp, thresholdSeconds, now = Date.now()) => {
    return timestamp > now + (thresholdSeconds * 1000)
}

module.exports = {
    isTimestampTooFarInTheFuture
}
