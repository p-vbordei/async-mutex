import { describe, it, expect } from "vitest";
import { Mutex, RWLock, Semaphore } from "../src/index.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Mutex", () => {
  it("serializes acquirers", async () => {
    const m = new Mutex();
    const order: number[] = [];
    let active = 0;
    let maxActive = 0;
    const task = (i: number) =>
      m.run(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await sleep(10);
        active--;
        order.push(i);
      });
    await Promise.all([task(1), task(2), task(3)]);
    expect(maxActive).toBe(1);
    expect(order).toEqual([1, 2, 3]);
  });

  it("returns value from run()", async () => {
    expect(await new Mutex().run(async () => 42)).toBe(42);
  });

  it("releases on throw", async () => {
    const m = new Mutex();
    await expect(m.run(async () => { throw new Error("boom"); })).rejects.toThrow();
    expect(m.isLocked).toBe(false);
  });

  it("acquire+release manual usage", async () => {
    const m = new Mutex();
    const release = await m.acquire();
    expect(m.isLocked).toBe(true);
    release();
    expect(m.isLocked).toBe(false);
    // Calling release twice is a no-op.
    release();
    expect(m.isLocked).toBe(false);
  });
});

describe("RWLock", () => {
  it("allows multiple concurrent readers", async () => {
    const lock = new RWLock();
    let active = 0;
    let maxActive = 0;
    const reader = () =>
      lock.withRead(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await sleep(20);
        active--;
      });
    await Promise.all([reader(), reader(), reader()]);
    expect(maxActive).toBe(3);
  });

  it("writer is exclusive", async () => {
    const lock = new RWLock();
    let activeReaders = 0;
    let writerActive = false;
    let violation = false;
    const reader = () =>
      lock.withRead(async () => {
        if (writerActive) violation = true;
        activeReaders++;
        await sleep(10);
        activeReaders--;
      });
    const writer = () =>
      lock.withWrite(async () => {
        if (activeReaders > 0) violation = true;
        writerActive = true;
        await sleep(10);
        writerActive = false;
      });
    await Promise.all([reader(), reader(), writer(), reader(), writer(), reader()]);
    expect(violation).toBe(false);
  });

  it("writer preference: pending writer blocks new readers", async () => {
    const lock = new RWLock();
    const order: string[] = [];

    // Hold a reader to keep the writer queued.
    const r1Release = await lock.acquireRead();
    const w = lock.acquireWrite().then((rel) => { order.push("W"); rel(); });

    // Try to acquire another read. Should NOT skip ahead of the queued writer.
    let r2Acquired = false;
    const r2 = lock.acquireRead().then((rel) => {
      r2Acquired = true;
      order.push("R");
      rel();
    });

    await sleep(20);
    expect(r2Acquired).toBe(false);
    r1Release();
    await Promise.all([w, r2]);
    expect(order).toEqual(["W", "R"]);
  });
});

describe("Semaphore", () => {
  it("allows up to N concurrent holders", async () => {
    const s = new Semaphore(2);
    let active = 0;
    let maxActive = 0;
    const t = () =>
      s.run(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await sleep(10);
        active--;
      });
    await Promise.all([t(), t(), t(), t()]);
    expect(maxActive).toBe(2);
  });

  it("rejects bad permit count", () => {
    expect(() => new Semaphore(0)).toThrow();
    expect(() => new Semaphore(-1)).toThrow();
    expect(() => new Semaphore(1.5)).toThrow();
  });

  it("manual release works", async () => {
    const s = new Semaphore(1);
    const release = await s.acquire();
    expect(s.availablePermits).toBe(0);
    release();
    expect(s.availablePermits).toBe(1);
  });
});
