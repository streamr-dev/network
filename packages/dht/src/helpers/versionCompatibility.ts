// Is able to compare versions such as 1.2.3 and 1.2.4
// can also compare versions such as 100.0.0-pretestnet.0 and 100.0.0-pretestnet.40
export const isCompatibleVersion = (version1: string, version2: string): boolean => {
    const minorSourceVersion = excludePatchVersion(version1)
    const minorOwnVersion = excludePatchVersion(version2)
    return minorSourceVersion === minorOwnVersion
}

export const excludePatchVersion = (version: string): string => {
    const versionParts = version.split('.')
    versionParts.pop()
    return versionParts.join('.')
}
