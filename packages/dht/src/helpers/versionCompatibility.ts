export const isSupportedVersion = (version: string, supportedVersions: string[]): boolean => {
    return supportedVersions.includes(version)
}