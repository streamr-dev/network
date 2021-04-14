const createMockStorageConfig = (streams) => {
    return {
        getStreams: () => {
            return streams
        },
        addChangeListener: () => {}
    }
}
module.exports = {
    createMockStorageConfig
}
