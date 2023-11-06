export interface ChallengeManager {
    createChallenge(name: string, value: string): Promise<void>
    deleteChallenge(name: string): Promise<void>
}
