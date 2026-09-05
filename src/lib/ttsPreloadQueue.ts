// Two workers overlap network latency without creating an unbounded request
// burst. The Worker remains the authority for rate limits and Basic credits.
export const DEFAULT_TTS_PRELOAD_CONCURRENCY = 2;

export type TTSPreloadPriority = 'normal' | 'high';

interface PreloadJob {
  key: string;
  owners: Set<string>;
  priority: TTSPreloadPriority;
  state: 'queued' | 'running';
  run: () => Promise<void>;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export interface PreloadEnqueueResult {
  promise: Promise<void>;
  deduplicated: boolean;
  state: 'queued' | 'running';
}

export interface PreloadCancellationResult {
  queuedCancelled: number;
  runningDiscarded: number;
}

/**
 * Conservative background queue for newly registered entries. Jobs with the
 * same normalized TTS key share one Promise, while separate requests are
 * limited so rapid registrations cannot create a request spike.
 */
export class ControlledTTSPreloadQueue {
  private readonly jobs = new Map<string, PreloadJob>();
  private readonly queued: PreloadJob[] = [];
  private running = 0;

  constructor(private readonly concurrency = DEFAULT_TTS_PRELOAD_CONCURRENCY) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('invalid_preload_concurrency');
    }
  }

  enqueue(
    key: string,
    ownerId: string,
    run: () => Promise<void>,
    priority: TTSPreloadPriority = 'normal',
  ): PreloadEnqueueResult {
    const existing = this.jobs.get(key);
    if (existing) {
      existing.owners.add(ownerId);
      return { promise: existing.promise, deduplicated: true, state: existing.state };
    }

    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const job: PreloadJob = {
      key,
      owners: new Set([ownerId]),
      priority,
      state: 'queued',
      run,
      promise,
      resolve,
      reject,
    };
    this.jobs.set(key, job);
    // A freshly saved word should not sit behind a whole post-purchase library
    // sweep. Identical work still joins the existing job above.
    if (priority === 'high') {
      const firstNormal = this.queued.findIndex(queued => queued.priority === 'normal');
      if (firstNormal < 0) this.queued.push(job);
      else this.queued.splice(firstNormal, 0, job);
    } else {
      this.queued.push(job);
    }
    this.pump();
    return { promise, deduplicated: false, state: job.state };
  }

  cancelOwner(ownerId: string): PreloadCancellationResult {
    let queuedCancelled = 0;
    let runningDiscarded = 0;
    for (const job of this.jobs.values()) {
      if (!job.owners.delete(ownerId) || job.owners.size > 0) continue;
      if (job.state === 'queued') {
        const index = this.queued.indexOf(job);
        if (index >= 0) this.queued.splice(index, 1);
        this.jobs.delete(job.key);
        job.resolve();
        queuedCancelled++;
      } else {
        // A running request may already be shared by manual playback through
        // the request registry. Do not abort it; simply discard card ownership.
        runningDiscarded++;
      }
    }
    return { queuedCancelled, runningDiscarded };
  }

  /** Cancel queued ownership selected by normalized generation identity. */
  cancelMatching(predicate: (key: string) => boolean): PreloadCancellationResult {
    let queuedCancelled = 0;
    let runningDiscarded = 0;
    for (const job of this.jobs.values()) {
      if (!predicate(job.key)) continue;
      job.owners.clear();
      if (job.state === 'queued') {
        const index = this.queued.indexOf(job);
        if (index >= 0) this.queued.splice(index, 1);
        this.jobs.delete(job.key);
        job.resolve();
        queuedCancelled++;
      } else {
        runningDiscarded++;
      }
    }
    return { queuedCancelled, runningDiscarded };
  }

  hasOwners(key: string): boolean {
    return (this.jobs.get(key)?.owners.size ?? 0) > 0;
  }

  private pump(): void {
    while (this.running < this.concurrency && this.queued.length > 0) {
      const job = this.queued.shift();
      if (!job || this.jobs.get(job.key) !== job || job.owners.size === 0) continue;
      job.state = 'running';
      this.running++;
      void Promise.resolve()
        .then(job.run)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.running--;
          if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
          this.pump();
        });
    }
  }
}

export function isAIPronunciationPreloadEligible(options: {
  hasAIAccess: boolean;
  text: string;
  hasCustomAudio?: boolean;
}): boolean {
  return options.hasAIAccess && !options.hasCustomAudio && options.text.trim().length > 0;
}
