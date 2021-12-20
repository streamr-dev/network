export default async () => {
    if (global.__StreamrKeyserver) {
        return new Promise((resolve) => global.__StreamrKeyserver.close(() => resolve()))
    }
}
