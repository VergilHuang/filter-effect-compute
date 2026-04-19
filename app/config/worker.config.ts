export const workerConfig = {
  poolSize: {
    min: 2,
    max: 4,
    default: 4,
  },
  getOptimalPoolSize(): number {
    if (typeof navigator === "undefined") {
      return this.poolSize.default;
    }
    return Math.max(
      this.poolSize.min,
      Math.min(
        navigator.hardwareConcurrency || this.poolSize.default,
        this.poolSize.max,
      ),
    );
  },
};
