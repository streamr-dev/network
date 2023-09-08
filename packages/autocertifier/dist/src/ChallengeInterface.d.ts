export interface ChallengeInterface {
    createChallenge(name: string, value: string): Promise<void>;
    deleteChallenge(name: string): Promise<void>;
}
