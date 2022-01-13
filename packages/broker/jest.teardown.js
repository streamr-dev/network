export default async () => {
    if (global.__StreamrKeyserver) {
        await global.__StreamrKeyserver.destroy()
    }
}
