---
title: 'Go concurrency, arriving from a class-based language'
description: >-
  Go has no classes and no inheritance, and channels are not queues. Four
  patterns that come up constantly, and the one thing about locks that isn't
  obvious.
date: '2026-08-02'
category: sys-design
tags:
  - go
  - concurrency
draft: false
source: sys-design/dist-sys/Go Threads and Raft.md
updated: '2026-08-02'
---

Coming to Go from Java or C++ or Python, the first impression is that things are missing. There are no classes. There's no inheritance. There's no `implements` keyword, and no `extends`.

Nothing is missing. The pieces are arranged differently, and the arrangement only makes sense once you get to the concurrency, which is what the language is actually built around.

## Structs, methods, and interfaces that don't know about you

A class does three jobs at once: it holds data, it owns behaviour, and it declares which interfaces it belongs to. Go separates all three.

<figure class="diagram">
<svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A class bundles data and behaviour and declares what it implements; Go separates the struct from its methods and satisfies interfaces implicitly">
<defs>
<marker id="si-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="si-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<text x="20" y="24" class="t-strong">a class</text>
<text x="100" y="24" class="t-sm">— one box, and it declares its own membership</text>
<rect x="20" y="40" width="280" height="110" rx="6" class="box"/>
<text x="36" y="64" class="t-mono t-sm">class Store implements Writer</text>
<line x1="36" y1="76" x2="284" y2="76" class="rule"/>
<text x="36" y="98" class="t-sm">fields</text>
<text x="36" y="120" class="t-sm">methods</text>
<text x="36" y="142" class="t-sm">the interface it claims</text>
<text x="330" y="70" class="t-sm">Everything is bundled, and the</text>
<text x="330" y="88" class="t-sm">class states up front which</text>
<text x="330" y="106" class="t-sm">interfaces it belongs to.</text>
<text x="330" y="132" class="t-sm">Adding an interface later means</text>
<text x="330" y="150" class="t-sm">editing the class.</text>
<line x1="20" y1="174" x2="680" y2="174" class="rule"/>
<text x="20" y="204" class="t-strong t-accent">Go</text>
<text x="70" y="204" class="t-sm">— three separate things that happen to fit</text>
<rect x="20" y="220" width="150" height="62" rx="6" class="box"/>
<text x="95" y="242" text-anchor="middle" class="t-mono t-sm">type Store struct</text>
<text x="95" y="264" text-anchor="middle" class="t-sm">just the data</text>
<rect x="196" y="220" width="180" height="62" rx="6" class="box"/>
<text x="286" y="242" text-anchor="middle" class="t-mono t-sm">func (s *Store) Write</text>
<text x="286" y="264" text-anchor="middle" class="t-sm">attached from outside</text>
<rect x="450" y="220" width="230" height="62" rx="6" class="box-accent"/>
<text x="565" y="242" text-anchor="middle" class="t-mono t-sm">type Writer interface</text>
<text x="565" y="264" text-anchor="middle" class="t-sm t-accent">never mentions Store</text>
<line x1="380" y1="251" x2="444" y2="251" class="arrow arrow-accent arrow-dash" marker-end="url(#si-b)"/>
<text x="412" y="241" text-anchor="middle" class="t-sm">fits</text>
</svg>
<figcaption>A class is one box. Go is three things that happen to fit together.</figcaption>
</figure>

A struct holds data and nothing else:

```go
type Store struct {
    chunkSize int
}
```

Methods are attached from outside, by naming a receiver:

```go
func (s *Store) CreateFile(name string, data []byte) (FileMetadata, error) {
    // ...
}
```

That `(s *Store)` is the whole mechanism. The method isn't *inside* `Store`; it's a function that declares which type it hangs off. You can add methods to a type from anywhere in its package, and the type doesn't know or care.

Then interfaces, which are just a list of signatures:

```go
type Writer interface {
    CreateFile(name string, data []byte) (FileMetadata, error)
}
```

And here's the part that takes adjusting to. **`Store` satisfies `Writer` automatically.** There's no declaration, no `implements`, no import relationship. If the methods match, it fits.

Which inverts who's in charge. In a class-based language the implementer decides what it implements, and adding an interface means editing the class. In Go the *consumer* defines the interface it needs, and anything with matching methods already qualifies — including types written before your interface existed, by people who never saw it.

There's no inheritance either. Instead you embed one struct in another and get composition, and you use interfaces where you'd have reached for a base class. Which is the advice every object-oriented codebase eventually arrives at anyway; Go just removed the other option.

## One gotcha before the concurrency

A slice is a view, not a copy. Slicing one:

```go
b := a[2:5]
```

does not allocate. `b` points into `a`'s memory, and writing through `b` changes `a`. Coming from a language where this copies, that's an afternoon lost.

Worth knowing the two-argument and three-argument forms of `make` too:

```go
make([]byte, 0)        // empty, Go grows it as needed
make([]byte, 0, size)  // empty, but capacity reserved up front — no regrowth
```

The second matters in hot paths, where repeated growth means repeated copying.

## Goroutines, and waiting for them

A goroutine is `go` in front of a call. That's it. What you need immediately afterwards is a way to know they've finished, because the main function exiting takes the whole program with it, unfinished goroutines included.

That's `sync.WaitGroup`, and the fan-out pattern comes up constantly — send an RPC to every peer, wait for all of them:

```go
var wg sync.WaitGroup

for i := 0; i < len(peers); i++ {
    wg.Add(1)
    go func(peer int) {
        defer wg.Done()
        sendRPC(peer)
    }(peer)
}

wg.Wait()
```

Three things worth pointing at. `Add` happens before the goroutine starts, not inside it — otherwise `Wait` can run before anything has been added and return immediately. `Done` is deferred, so it runs even if `sendRPC` panics. And the loop variable is passed *in* as an argument, because a goroutine capturing a loop variable by reference is the oldest bug in Go.

Two other shapes recur. Doing something on an interval:

```go
go func() {
    for {
        time.Sleep(100 * time.Millisecond)
        doPeriodicThing()
    }
}()
```

And doing something until told to stop, with a clean exit:

```go
done := make(chan struct{})

go func() {
    for {
        select {
        case <-done:
            cleanup()
            return
        default:
            doWork()
        }
    }
}()

close(done)  // every receiver wakes at once
```

## Locks protect more than variables

The obvious failure: several goroutines incrementing a shared counter without a lock, and the final value being wrong because increments got interleaved and lost.

The obvious fix:

```go
mu.Lock()
defer mu.Unlock()
counter++
```

`defer` is doing real work there. It runs the unlock when the function returns, by whatever route — including an early return added six months later by someone who didn't notice they'd just introduced a deadlock.

But here is the thing that isn't obvious, and it's the most useful idea in my notes on this:

**A lock doesn't only protect individual updates. It protects invariants across a group of variables.**

Say two accounts must always sum to 100. Moving 10 between them is two writes, and there is a moment between them when the sum is 90. Each write is individually safe — the two variables are separate, no update is being lost. But a reader that arrives in that gap sees a state that is supposed to be impossible.

The lock isn't guarding the variables. It's guarding the *rule that relates them*, by making the pair of writes indivisible from outside. Which reframes the question you ask when writing concurrent code: not "which variables are shared" but "what has to stay true, and which operations temporarily break it".

## Waiting for a condition

Different problem. A group of goroutines updates shared state, and one other goroutine needs to act when that state reaches some threshold — enough votes have come in, say.

You could poll it in a loop with a sleep. That's wasteful and adds latency in both directions. `sync.Cond` is the right tool:

```go
mu.Lock()
for votes < majority {
    cond.Wait()
}
mu.Unlock()
```

`cond.Wait()` atomically releases the lock and parks the goroutine. When a voter calls `cond.Broadcast()`, the waiter wakes, reacquires the lock, and re-checks.

Two rules that aren't optional. **Hold the lock when you call `Wait` and when you call `Broadcast`** — the whole point is that releasing and sleeping happen atomically, and that only works if you held it. And **wait in a `for`, never an `if`**: `Broadcast` wakes everybody, the condition may no longer hold by the time you're scheduled, and you have to look again.

## Channels are not queues

This is the one that catches people hardest, and it's worth being blunt: **a channel is not a queue.** An unbuffered channel is a synchronisation point that happens to carry a value.

<figure class="diagram">
<svg viewBox="0 0 700 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An unbuffered channel makes both goroutines wait until they meet; a buffered channel lets the sender continue until the buffer is full">
<defs>
<marker id="cr-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="cr-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<text x="20" y="24" class="t-strong t-accent">unbuffered</text>
<text x="130" y="24" class="t-sm">— a handshake, not a queue</text>
<rect x="20" y="42" width="130" height="40" rx="5" class="box"/><text x="85" y="67" text-anchor="middle" class="t-sm">sender</text>
<rect x="530" y="42" width="130" height="40" rx="5" class="box"/><text x="595" y="67" text-anchor="middle" class="t-sm">receiver</text>
<line x1="85" y1="88" x2="85" y2="150" class="arrow arrow-accent arrow-dash"/>
<line x1="595" y1="88" x2="595" y2="150" class="arrow arrow-dash"/>
<text x="96" y="112" class="t-sm t-accent">blocked, waiting</text>
<text x="450" y="112" class="t-sm">arrives late</text>
<line x1="85" y1="150" x2="595" y2="150" class="arrow arrow-accent" marker-end="url(#cr-b)"/>
<text x="340" y="142" text-anchor="middle" class="t-sm t-accent">both resume the instant they meet</text>
<text x="20" y="180" class="t-sm">Neither side proceeds until the other is ready. The value never sits anywhere —</text>
<text x="20" y="198" class="t-sm">it is handed across. This is synchronisation that happens to carry data.</text>
<line x1="20" y1="220" x2="680" y2="220" class="rule"/>
<text x="20" y="250" class="t-strong">buffered</text>
<text x="118" y="250" class="t-mono t-sm">make(chan bool, 4)</text>
<rect x="20" y="266" width="110" height="38" rx="5" class="box"/><text x="75" y="290" text-anchor="middle" class="t-sm">sender</text>
<rect x="180" y="270" width="34" height="30" rx="3" class="box-accent"/>
<rect x="220" y="270" width="34" height="30" rx="3" class="box-accent"/>
<rect x="260" y="270" width="34" height="30" rx="3" class="box"/>
<rect x="300" y="270" width="34" height="30" rx="3" class="box"/>
<line x1="134" y1="285" x2="174" y2="285" class="arrow" marker-end="url(#cr-a)"/>
<rect x="380" y="266" width="110" height="38" rx="5" class="box"/><text x="435" y="290" text-anchor="middle" class="t-sm">receiver</text>
<line x1="340" y1="285" x2="374" y2="285" class="arrow" marker-end="url(#cr-a)"/>
<text x="510" y="282" class="t-sm">The sender carries on until</text>
<text x="510" y="300" class="t-sm">the buffer is full. Then it waits.</text>
</svg>
<figcaption>Unbuffered means both sides wait until they meet. Buffered gives you slack.</figcaption>
</figure>

Send on an unbuffered channel and you block until somebody receives. Not until somebody *collects it later* — until a receiver is standing there, at that moment. The value is handed across. If the receiver arrives a second late, the sender waited a second.

That's the mental model to hold: a channel send is a rendezvous. Both goroutines meet at the channel and both continue once they have.

A buffered channel adds slack:

```go
c := make(chan bool, 4)
```

Now the sender can deposit up to four values and carry on. On the fifth, with nothing drained, it blocks again. So a buffered channel *is* a queue — a bounded one — and an unbuffered channel is a queue of size zero, which is to say not a queue at all.

The classic use is producer/consumer, where the buffer size is doing real work: it's the amount the producer may run ahead before it's forced to wait for the consumer. Backpressure, in one integer.

## Two idioms, both fine

Go ships with both styles. Channels, for handing work and ownership between goroutines. Mutexes and condition variables, for protecting state several goroutines share.

The slogan — *share memory by communicating* — is good advice and gets over-applied. Plenty of things really are shared state with an invariant attached, and a mutex says that more clearly than a channel pretending to be one. A consensus implementation with a term number, a vote count and a log all needing to stay consistent with each other is a mutex problem, not a channel problem.

Reach for a channel when something is being *handed over*. Reach for a lock when something is being *shared*.

## Sources

- [MIT 6.824 Distributed Systems](https://pdos.csail.mit.edu/6.824/) — where these patterns came from
- [Effective Go](https://go.dev/doc/effective_go) · [The Go Memory Model](https://go.dev/ref/mem)
- [sync](https://pkg.go.dev/sync) — `WaitGroup`, `Mutex`, `Cond`
- [Go slices: usage and internals](https://go.dev/blog/slices-intro)

Diagrams are my own.

