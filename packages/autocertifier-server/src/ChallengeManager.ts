export interface ChallengeManager {
    createChallenge(fqdn: string, value: string): Promise<void>
    deleteChallenge(fqdn: string, value: string): Promise<void>
}
