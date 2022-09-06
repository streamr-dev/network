/**
 * Wait for a specific time
 * @param ms time to wait for in milliseconds
 * @returns {Promise<void>} resolves when time has passed
 */
export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
