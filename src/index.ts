type Resolver = () => void;

/**
 * A simple, non-reentrant async mutex. Acquire returns a release function;
 * forgetting to release is a permanent deadlock — prefer `run()` when possible.
 */
export class Mutex {
  private locked = false;
  private readonly waiters: Resolver[] = [];

  /**
   * Acquire the lock. Returns a release function. **Must be called.**
   * Use `run()` for the safe variant.
   */
  async acquire(): Promise<() => void> {
    while (this.locked) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.locked = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.locked = false;
      const next = this.waiters.shift();
      if (next) next();
    };
  }

  /** Run `fn` exclusively. Lock is released on resolve or reject. */
  async run<T>(fn: () => T | Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** True when the mutex is currently held. */
  get isLocked(): boolean {
    return this.locked;
  }

  /** Number of acquirers waiting. */
  get waitingCount(): number {
    return this.waiters.length;
  }
}

/**
 * A reader-writer lock. Multiple readers can hold the lock simultaneously,
 * but writers acquire exclusively.
 *
 * **Writer-preference**: while a writer is waiting, new readers also wait,
 * preventing writer starvation under sustained read load.
 */
export class RWLock {
  private readers = 0;
  private writerActive = false;
  private readonly writerWaiters: Resolver[] = [];
  private readonly readerWaiters: Resolver[] = [];

  /** Acquire a read lock. Returns a release function. */
  async acquireRead(): Promise<() => void> {
    while (this.writerActive || this.writerWaiters.length > 0) {
      await new Promise<void>((resolve) => this.readerWaiters.push(resolve));
    }
    this.readers += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.readers -= 1;
      this.maybeWake();
    };
  }

  /** Acquire the write lock. Exclusive — blocks new readers and other writers. */
  async acquireWrite(): Promise<() => void> {
    while (this.writerActive || this.readers > 0) {
      await new Promise<void>((resolve) => this.writerWaiters.push(resolve));
    }
    this.writerActive = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.writerActive = false;
      this.maybeWake();
    };
  }

  /** Run `fn` under a read lock. */
  async withRead<T>(fn: () => T | Promise<T>): Promise<T> {
    const release = await this.acquireRead();
    try { return await fn(); }
    finally { release(); }
  }

  /** Run `fn` under the write lock. */
  async withWrite<T>(fn: () => T | Promise<T>): Promise<T> {
    const release = await this.acquireWrite();
    try { return await fn(); }
    finally { release(); }
  }

  private maybeWake(): void {
    // Wake one writer if no readers active.
    if (this.readers === 0 && this.writerWaiters.length > 0 && !this.writerActive) {
      const w = this.writerWaiters.shift()!;
      w();
      return;
    }
    // Otherwise, wake all readers (no writer waiting).
    if (!this.writerActive && this.writerWaiters.length === 0) {
      const r = this.readerWaiters.splice(0, this.readerWaiters.length);
      for (const fn of r) fn();
    }
  }

  get isWriteLocked(): boolean {
    return this.writerActive;
  }
  get readerCount(): number {
    return this.readers;
  }
}

/**
 * Bounded semaphore. Allows up to `n` concurrent holders.
 */
export class Semaphore {
  private available: number;
  private readonly waiters: Resolver[] = [];

  constructor(permits: number) {
    if (!Number.isInteger(permits) || permits < 1) {
      throw new Error("permits must be a positive integer");
    }
    this.available = permits;
  }

  async acquire(): Promise<() => void> {
    while (this.available <= 0) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.available -= 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.available += 1;
      const next = this.waiters.shift();
      if (next) next();
    };
  }

  async run<T>(fn: () => T | Promise<T>): Promise<T> {
    const release = await this.acquire();
    try { return await fn(); }
    finally { release(); }
  }

  get availablePermits(): number {
    return this.available;
  }
}
