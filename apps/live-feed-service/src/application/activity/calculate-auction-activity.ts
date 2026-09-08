/**
 * Performs the bounded, deterministic CPU calculation used by live-feed diagnostics.
 */

/**
 * Structured numeric input for one activity calculation.
 */
export type ActivityInput = {
  samples: readonly number[];
  bucketCount?: number;
  iterations?: number;
};

/**
 * Histogram and percentile result returned by the activity calculation.
 */
export type ActivityResult = {
  sampleCount: number;
  histogram: number[];
  percentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
  checksum: number;
};

const defaultBucketCount = 5;
const defaultIterations = 50_000;
const maxSampleCount = 10_000;
const maxBucketCount = 32;
const maxIterations = 20_000_000;
const checksumModulo = 2_147_483_647;

/**
 * Calculates a bounded histogram, percentiles, and deterministic checksum without side effects.
 */
export function calculateAuctionActivity(input: ActivityInput): ActivityResult {
  const bucketCount = input.bucketCount ?? defaultBucketCount;
  const iterations = input.iterations ?? defaultIterations;
  validateInput(input.samples, bucketCount, iterations);

  const sortedSamples = [...input.samples].sort((left, right) => left - right);
  const minimum = sortedSamples[0] ?? 0;
  const maximum = sortedSamples[sortedSamples.length - 1] ?? 0;
  const histogram = createHistogram(input.samples, bucketCount, minimum, maximum);
  let checksum = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let index = 0; index < input.samples.length; index += 1) {
      checksum = (checksum + Math.trunc(Math.abs(input.samples[index]) * 1000) + iteration + index) % checksumModulo;
    }
  }

  return {
    sampleCount: input.samples.length,
    histogram,
    percentiles: {
      p50: percentile(sortedSamples, 0.5),
      p95: percentile(sortedSamples, 0.95),
      p99: percentile(sortedSamples, 0.99),
    },
    checksum,
  };
}

function validateInput(samples: readonly number[], bucketCount: number, iterations: number): void {
  if (samples.length > maxSampleCount || samples.some((sample) => !Number.isFinite(sample))) {
    throw new Error('Activity samples must be finite and bounded.');
  }

  if (!Number.isInteger(bucketCount) || bucketCount < 1 || bucketCount > maxBucketCount) {
    throw new Error('Activity bucket count is outside the supported range.');
  }

  if (!Number.isInteger(iterations) || iterations < 1 || iterations > maxIterations) {
    throw new Error('Activity iteration count is outside the supported range.');
  }
}

function createHistogram(samples: readonly number[], bucketCount: number, minimum: number, maximum: number): number[] {
  const histogram = Array.from({ length: bucketCount }, () => 0);

  for (const sample of samples) {
    const bucket =
      minimum === maximum
        ? 0
        : Math.min(bucketCount - 1, Math.floor(((sample - minimum) / (maximum - minimum)) * bucketCount));
    histogram[bucket] += 1;
  }

  return histogram;
}

function percentile(sortedSamples: readonly number[], rank: number): number {
  if (sortedSamples.length === 0) {
    return 0;
  }

  return sortedSamples[Math.min(sortedSamples.length - 1, Math.ceil(sortedSamples.length * rank) - 1)] ?? 0;
}
