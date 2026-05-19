# async-mutex

[![ci](https://github.com/p-vbordei/async-mutex/actions/workflows/ci.yml/badge.svg)](https://github.com/p-vbordei/async-mutex/actions/workflows/ci.yml)

Tiny async-aware concurrency primitives — `Mutex`, `RWLock` (writer-preference, no starvation), and `Semaphore`. Zero dependencies.

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
await Promise.all(urls.map((u) =>
  sem.run(() => fetch(u))
));
```

> Published on npm under the scope `@p-vbordei/async-mutex` because the bare name `async-mutex` was already taken.

## Install

```sh
npm install @p-vbordei/async-mutex
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

## Patterns

```ts
// Read-modify-write under a mutex
await m.run(async () => {
  const v = await read();
  await write(v + 1);
});

// "Once": run a costly init exactly once, even if called concurrently
let inited = false;
const initMutex = new Mutex();
async function ensureInit() {
  if (inited) return;
  await initMutex.run(async () => {
    if (inited) return;       // re-check inside lock
    await loadConfig();
    inited = true;
  });
}
```

## License

Apache-2.0 © Vlad Bordei
