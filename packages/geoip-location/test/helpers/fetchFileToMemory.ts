export const fetchFileToMemory = async (url: string): Promise<Uint8Array> => {
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error('HTTP error when downloading ' + url + ', status: ' + response.status)
    }
    return new Uint8Array(await response.arrayBuffer())
}
