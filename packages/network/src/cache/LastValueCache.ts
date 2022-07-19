export class LastValueCache {
  private lastValue: string

  constructor() {
      this.lastValue = ""
  }

  setLastValue(newLastValue: string): void {
      this.lastValue = newLastValue
  }

  getLastValue(): string {
      return this.lastValue
  }
}
