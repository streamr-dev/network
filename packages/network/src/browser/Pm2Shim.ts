// mock implementation to shim the functionality of @pm2/io package in browser environment
export default {
    meter: (_config: unknown): any => ({
        mark: () => {}
    })
}