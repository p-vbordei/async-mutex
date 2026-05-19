# async-mutex

[![ci](https://github.com/p-vbordei/async-mutex/actions/workflows/ci.yml/badge.svg)](https://github.com/p-vbordei/async-mutex/actions/workflows/ci.yml)

[![npm](https://img.shields.io/npm/v/%40p-vbordei%2Fasync-mutex.svg)](https://www.npmjs.com/package/@p-vbordei/async-mutex)
[![downloads](https://img.shields.io/npm/dm/%40p-vbordei%2Fasync-mutex.svg)](https://www.npmjs.com/package/@p-vbordei/async-mutex)
[![bundle](https://img.shields.io/bundlejs/size/%40p-vbordei%2Fasync-mutex)](https://bundlejs.com/?q=%40p-vbordei%2Fasync-mutex)

> Tiny async-aware concurrency primitives — `Mutex`, `RWLock` (writer-preference, no starvation), and `Semaphore`. Zero dependencies.

```ts
import { Mutex, RWLock, Semaphore } from "@p-vbordei/async-mutex";

// Mutex: serialize critical section
const m = new Mutex();
await m.run(async () => {
  // exclusive access
});

// RWLock: readers concurrent, writer exclusive
const lock = new RWLock();
await lock.withRead(async () => { /* parallel reads */ });
await lock.withWrite(async () => { /* exclusive write */ });

// Semaphore: bounded concurrency
const sem = new Semaphore(5);
await Promise.all(urls.map((u) => sem.run(() => fetch(u))));
```

## Install

```sh
npm install @p-vbordei/async-mutex

> Published on npm under the scope `@p-vbordei/async-mutex` because the bare name `async-mutex` was already taken.

Works with Node 20+, browsers, Bun, Deno. ESM + CJS.

## Why

JavaScript is single-threaded but async operations interleave — code between `await` points runs while other coroutines wait. That means a race condition CAN happen between two async functions reading-modifying-writing the same data:

```ts
// Bug: two concurrent calls can both read the old count
async function increment() {
  const v = await db.get("count");
  await db.set("count", v + 1);
}
```

You need a mutex even in single-threaded JS. Most existing libraries are CJS-only or ship with event-emitter dependencies. This is ~150 lines, ESM-first, fully typed.

## Recipes

### Read-modify-write under a mutex

```ts
import { Mutex } from "@p-vbordei/async-mutex";

const m = new Mutex();

async function increment() {
  await m.run(async () => {
    const v = await db.get("count");
    await db.set("count", v + 1);
  });
}
```

### Init-once pattern

```ts
import { Mutex } from "@p-vbordei/async-mutex";

let inited: Config | null = null;
const initMutex = new Mutex();

async function getConfig(): Promise<Config> {
  if (inited) return inited;
  return await initMutex.run(async () => {
    if (inited) return inited;  // re-check inside lock (double-checked locking)
    inited = await loadConfig();
    return inited;
  });
}
```

### RWLock for cache with occasional invalidation

```ts
import { RWLock } from "@p-vbordei/async-mutex";

const lock = new RWLock();
let cache: Snapshot | null = null;

async function read(): Promise<Snapshot> {
  return await lock.withRead(async () => {
    if (cache) return cache;
    return await fetchSnapshot();
  });
}

async function invalidate() {
  await lock.withWrite(async () => { cache = null; });
}
```

### Bounded concurrency with Semaphore

```ts
import { Semaphore } from "@p-vbordei/async-mutex";

const sem = new Semaphore(10);

async function processAll(items: Item[]) {
  return Promise.all(items.map((item) => sem.run(() => process(item))));
}
```

### Manual acquire/release (when `run` isn't enough)

```ts
import { Mutex } from "@p-vbordei/async-mutex";

const m = new Mutex();
const release = await m.acquire();
try {
  await criticalSection();
} finally {
  release();  // safe to call multiple times — no-op after first
}
```

## API

### `class Mutex`

```ts
m.acquire(): Promise<release>      // returns release function
m.run(fn): Promise<T>              // safe form: lock released on resolve OR reject
m.isLocked: boolean
m.waitingCount: number
```

### `class RWLock`

```ts
lock.acquireRead(): Promise<release>
lock.acquireWrite(): Promise<release>
lock.withRead(fn): Promise<T>
lock.withWrite(fn): Promise<T>
lock.isWriteLocked: boolean
lock.readerCount: number
```

**Writer preference**: when a writer is waiting, new readers also wait. Prevents writer starvation under sustained reads.

### `class Semaphore`

```ts
new Semaphore(permits)             // throws if permits is not a positive integer
sem.acquire(): Promise<release>
sem.run(fn): Promise<T>
sem.availablePermits: number
```

## Caveats

- **Single-process scope.** These are in-memory locks. For cross-process coordination, use Redis Redlock or a database advisory lock.
- **No timeouts on acquire.** If you need a deadline, wrap with [@p-vbordei/cancellable](https://github.com/p-vbordei/cancellable):
  ```ts
  await withTimeout(m.acquire(), 5000);
  ```
- **No reentrancy.** Calling `acquire()` from inside a held lock will deadlock. Track state at your application layer if you need reentry.

## License

Apache-2.0 © Vlad Bordei
