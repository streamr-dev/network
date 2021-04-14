const createMockStorageConfig = (streams) => {
    return {
        hasStream: (stream) => {
            return streams.some((s) => (s.id === stream.id) && (s.partition === stream.partition))
        },
        getStreams: () => {
            return streams
        },
        addChangeListener: () => {}
    }
}
module.exports = {
    createMockStorageConfig
}
