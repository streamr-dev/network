module.exports = {
    getAuthorizationHeader: (authKey, sessionToken) => {
        const headers = {}
        if (sessionToken) {
            headers.Authorization = `Bearer ${sessionToken}`
        } else if (authKey) {
            headers.Authorization = `token ${authKey}`
        }
        return headers
    },
}
