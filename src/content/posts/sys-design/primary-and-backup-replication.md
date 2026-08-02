---
title: Primary and Backup Replication
description: >-
  Deterministic replay is a beautiful idea, and reality attacks it from five
  directions. How VMware FT holds a backup VM in lockstep — and what it gives up
  to do it.
date: '2026-08-01'
category: sys-design
tags: []
draft: false
source: sys-design/dist-sys/Primary and Backup Replication.md
updated: '2026-08-02'
---

Here is an idea that sounds too good to be true. Run your server on two machines. Feed both the exact same instructions in the exact same order. Both machines end up in the exact same state, so when one dies you switch to the other and nobody notices — no failover dance, no state to reconstruct, no lost requests.

VMware built this. It's called Fault Tolerance, it works on unmodified operating systems, and the guest has no idea it's happening.

Most of what makes it interesting is everything that gets in the way.

## What replication actually buys you

Before any of the mechanism, it's worth being precise about the failure this defends against, because it's narrower than it sounds.

Replication handles **fail-stop** failures. The power supply dies, the machine halts, the network cable is pulled. Something stops working and — crucially — *stops*, rather than continuing incorrectly.

It does nothing at all for design bugs. If your code dereferences a null pointer on some particular input, feeding that input to two identical replicas crashes both, in the same way, at the same instruction. The backup is not a second opinion. It's a second copy, and copies reproduce faults faithfully.

That distinction matters because "we're replicated" gets used as though it meant "we're resilient", when it only means resilient to one specific category of thing going wrong.

## Two ways to keep a copy

If you want a backup holding the same state as the primary, there are two things you can send it.

<figure class="diagram">
<svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="State transfer copies the whole of memory across the wire; a replicated state machine sends only the operations and lets the backup recompute">
<defs>
<marker id="rm-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="rm-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<text x="20" y="26" class="t-strong">State transfer</text>
<text x="150" y="26" class="t-sm">— ship the answer</text>
<rect x="20" y="42" width="150" height="76" rx="6" class="box"/>
<text x="95" y="70" text-anchor="middle" class="t-sm">primary</text>
<text x="95" y="94" text-anchor="middle" class="t-sm">memory</text>
<rect x="480" y="42" width="150" height="76" rx="6" class="box"/>
<text x="555" y="70" text-anchor="middle" class="t-sm">backup</text>
<text x="555" y="94" text-anchor="middle" class="t-sm">memory</text>
<line x1="178" y1="88" x2="472" y2="88" class="arrow" marker-end="url(#rm-a)"/>
<text x="324" y="76" text-anchor="middle" class="t-sm">every page of RAM, continuously</text>
<text x="640" y="86" class="t-sm">simple,</text>
<text x="640" y="104" class="t-sm">expensive</text>
<line x1="20" y1="156" x2="680" y2="156" class="rule"/>
<text x="20" y="188" class="t-strong t-accent">Replicated state machine</text>
<text x="230" y="188" class="t-sm">— ship the question</text>
<rect x="20" y="204" width="150" height="76" rx="6" class="box-accent"/>
<text x="95" y="232" text-anchor="middle" class="t-sm">primary</text>
<text x="95" y="256" text-anchor="middle" class="t-sm">memory</text>
<rect x="480" y="204" width="150" height="76" rx="6" class="box-accent"/>
<text x="555" y="232" text-anchor="middle" class="t-sm">backup</text>
<text x="555" y="256" text-anchor="middle" class="t-sm">recomputes it</text>
<line x1="178" y1="242" x2="472" y2="242" class="arrow arrow-accent" marker-end="url(#rm-b)"/>
<text x="324" y="234" text-anchor="middle" class="t-sm">the operations only</text>
<text x="640" y="248" class="t-sm">cheap, and</text>
<text x="640" y="266" class="t-sm">very fragile</text>
</svg>
<figcaption>Send the resulting state, or send the operations and let the backup recompute it.</figcaption>
</figure>

**State transfer** ships the answer. Copy the primary's memory to the backup — all of it, continuously. Conceptually trivial: there's no way for the backup to diverge, because it isn't computing anything, only receiving. The problem is bandwidth. You're pushing the working set of a running machine across the network, forever.

**A replicated state machine** ships the question instead. Send the *operations* — the inputs, the requests, the interrupts — and let the backup run them itself and arrive at the same state independently. Cheap on the wire, because operations are tiny compared to the memory they touch.

VMware FT takes the second approach, and everything difficult that follows is a consequence of that one choice.

Because the replicated state machine idea rests on an assumption that isn't automatically true: that running the same operations produces the same result. On real hardware, it doesn't.

## The setup

<figure class="diagram">
<svg viewBox="0 0 700 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The client talks only to the primary, which streams a log channel to the backup; the backup runs the same instructions but its output is suppressed">
<defs>
<marker id="vf-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="vf-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<rect x="20" y="110" width="120" height="60" rx="6" class="box"/>
<text x="80" y="136" text-anchor="middle">client</text>
<text x="80" y="156" text-anchor="middle" class="t-sm">C</text>
<rect x="250" y="40" width="180" height="80" rx="6" class="box-accent"/>
<text x="340" y="70" text-anchor="middle" class="t-strong t-accent">primary</text>
<text x="340" y="92" text-anchor="middle" class="t-sm">A — runs the workload</text>
<text x="340" y="110" text-anchor="middle" class="t-sm">and answers</text>
<rect x="250" y="200" width="180" height="80" rx="6" class="box"/>
<text x="340" y="230" text-anchor="middle" class="t-strong">backup</text>
<text x="340" y="252" text-anchor="middle" class="t-sm">B — runs the same</text>
<text x="340" y="270" text-anchor="middle" class="t-sm">instructions, silently</text>
<line x1="144" y1="128" x2="246" y2="90" class="arrow" marker-end="url(#vf-a)"/>
<text x="180" y="100" class="t-sm">requests</text>
<line x1="246" y1="110" x2="144" y2="148" class="arrow" marker-end="url(#vf-a)"/>
<text x="180" y="168" class="t-sm">replies</text>
<line x1="340" y1="124" x2="340" y2="196" class="arrow arrow-accent" marker-end="url(#vf-b)"/>
<text x="352" y="166" class="t-sm t-accent">log channel</text>
<rect x="470" y="200" width="210" height="80" rx="6" class="box-ghost"/>
<text x="486" y="226" class="t-sm t-strong">every log entry</text>
<text x="486" y="248" class="t-mono">instruction number</text>
<text x="486" y="266" class="t-mono">type · data</text>
<rect x="470" y="40" width="210" height="120" rx="6" class="box-ghost"/>
<text x="486" y="66" class="t-sm t-strong">B's output goes nowhere</text>
<text x="486" y="90" class="t-sm">It computes the same reply</text>
<text x="486" y="108" class="t-sm">and the hypervisor drops it.</text>
<text x="486" y="132" class="t-sm">Requests sent to B are</text>
<text x="486" y="150" class="t-sm">routed to A instead.</text>
<text x="20" y="216" class="t-sm">If the log</text>
<text x="20" y="234" class="t-sm">channel goes</text>
<text x="20" y="252" class="t-sm">quiet, B stops</text>
<text x="20" y="270" class="t-sm">dropping its</text>
<text x="20" y="288" class="t-sm">output and</text>
<text x="20" y="306" class="t-sm">goes live.</text>
</svg>
<figcaption>The client only ever talks to the primary. The backup computes the same answers and has them thrown away.</figcaption>
</figure>

Two virtual machines on two physical hosts. One primary, one backup, and a **log channel** between them carrying a stream of entries, each with an instruction number, a type, and some data.

The client only ever talks to the primary. Requests that arrive at the backup are routed to the primary instead, so there is exactly one machine making decisions.

The part I find genuinely elegant is what the backup does with its results. It runs the same instructions and computes the same replies — and its hypervisor drops them on the floor. The backup is a fully functioning server whose output is suppressed. Failover isn't a matter of *starting* anything; it's the hypervisor stopping the suppression and letting a machine that was already running begin to speak.

If the log channel goes quiet for long enough, the backup's hypervisor concludes the primary is gone and goes live.

The backup also cannot run ahead. It buffers entries from the primary and holds its own execution back, because a backup that has raced ahead to instruction 5,000 can't usefully apply the primary's entry for instruction 4,000.

## The five things that break it

Now the interesting part: everything that stops two machines executing identical instructions from staying identical.

<figure class="diagram">
<svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three sources of non-determinism that break lockstep replay: interrupt timing, instructions that read the outside world, and multiple cores">
<text x="20" y="26" class="t-sm t-strong">Three ways two machines running the same instructions stop agreeing</text>
<rect x="20" y="46" width="205" height="150" rx="6" class="box"/>
<text x="122" y="76" text-anchor="middle" class="t-strong">interrupt timing</text>
<text x="36" y="106" class="t-sm">A packet arrives and the</text>
<text x="36" y="124" class="t-sm">NIC writes it to memory.</text>
<text x="36" y="142" class="t-sm">Landing one instruction</text>
<text x="36" y="160" class="t-sm">earlier or later changes</text>
<text x="36" y="178" class="t-sm">what the program sees.</text>
<rect x="247" y="46" width="205" height="150" rx="6" class="box"/>
<text x="349" y="76" text-anchor="middle" class="t-strong">reading the world</text>
<text x="263" y="106" class="t-sm">The current time. A</text>
<text x="263" y="124" class="t-sm">random number. These</text>
<text x="263" y="142" class="t-sm">return a different answer</text>
<text x="263" y="160" class="t-sm">on the backup, by</text>
<text x="263" y="178" class="t-sm">definition.</text>
<rect x="474" y="46" width="206" height="150" rx="6" class="box-accent"/>
<text x="577" y="76" text-anchor="middle" class="t-strong t-accent">two cores</text>
<text x="490" y="106" class="t-sm">Two threads racing for</text>
<text x="490" y="124" class="t-sm">a lock resolve one way</text>
<text x="490" y="142" class="t-sm">here and the other way</text>
<text x="490" y="160" class="t-sm">there. Nothing in the</text>
<text x="490" y="178" class="t-sm">log can capture it.</text>
<rect x="20" y="216" width="205" height="60" rx="5" class="box-ghost"/>
<text x="122" y="240" text-anchor="middle" class="t-sm">A sends the instruction</text>
<text x="122" y="260" text-anchor="middle" class="t-sm">number it landed on</text>
<rect x="247" y="216" width="205" height="60" rx="5" class="box-ghost"/>
<text x="349" y="240" text-anchor="middle" class="t-sm">A sends the answer</text>
<text x="349" y="260" text-anchor="middle" class="t-sm">it got</text>
<rect x="474" y="216" width="206" height="60" rx="5" class="box-ghost"/>
<text x="577" y="248" text-anchor="middle" class="t-sm t-accent">only allow one core</text>
</svg>
<figcaption>Three sources of divergence, and what the log channel can do about each.</figcaption>
</figure>

**Interrupt timing.** A packet arrives, the NIC uses DMA to write it into memory, and at some later point the processor takes an interrupt and deals with it. That "later point" is not deterministic — it depends on physical timing. If the interrupt lands one instruction earlier on the backup than it did on the primary, the two machines have just seen different things.

The fix is to make the timing part of the data. The primary records *which instruction number* the interrupt landed on and sends that down the log channel. The backup doesn't take an interrupt when its own hardware raises one — it takes it exactly where the primary did. The backup's own clock ticks are ignored entirely. It doesn't experience time; it replays the primary's experience of time.

**Instructions that read the outside world.** Ask for the current time and you get a different answer on two machines by definition. Same for a hardware random number, or anything else reading state the log channel doesn't control.

Same fix, more directly: the primary sends the instruction *and the answer it got*. The backup doesn't execute it at all, it just uses the primary's result.

**Multiple cores.** And here the whole approach falls over.

With two cores, two threads can race for a lock, and the winner is decided by physical timing far below anything you could log. There's no instruction number to record, because the interleaving isn't a sequence of instructions — it's two sequences happening at once. You cannot make that deterministic by sending more information.

VMware's answer is my favourite thing in this system: **only allow one core.**

That's it. No multiprocessor guests. The lockstep property depends entirely on there being a single, totally ordered instruction stream, so if multiple cores break it, you don't get multiple cores. For a production feature that customers paid for, that is a striking amount of performance to trade away for one property.

## The gap between deciding and telling

The fourth problem isn't about determinism at all. It's about ordering, and it's subtle enough to be worth walking through slowly.

<figure class="diagram">
<svg viewBox="0 0 700 380" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Without the output rule the primary can reply before the backup has learned of the request, so a failover loses state; the output rule holds the reply until the backup acknowledges">
<defs>
<marker id="or-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="or-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<text x="20" y="24" class="t-strong">Without the rule</text>
<text x="20" y="52" class="t-sm">A holds counter = 10. Client says "add 1".</text>
<rect x="20" y="66" width="200" height="34" rx="5" class="box"/>
<text x="120" y="88" text-anchor="middle" class="t-sm">1. A sets counter = 11</text>
<rect x="240" y="66" width="200" height="34" rx="5" class="box"/>
<text x="340" y="88" text-anchor="middle" class="t-sm">2. A replies "11" to the client</text>
<rect x="460" y="66" width="220" height="34" rx="5" class="box"/>
<text x="570" y="88" text-anchor="middle" class="t-sm">3. log entry to B is lost</text>
<line x1="224" y1="83" x2="236" y2="83" class="arrow" marker-end="url(#or-a)"/>
<line x1="444" y1="83" x2="456" y2="83" class="arrow" marker-end="url(#or-a)"/>
<rect x="20" y="120" width="660" height="52" rx="6" class="box-ghost"/>
<text x="36" y="142" class="t-sm">A dies. B has never heard of the request, goes live still holding 10.</text>
<text x="36" y="162" class="t-sm">The client was told 11. That number is now gone, and the client has no way to know.</text>
<line x1="20" y1="204" x2="680" y2="204" class="rule"/>
<text x="20" y="234" class="t-strong t-accent">With the output rule</text>
<text x="20" y="262" class="t-sm">The reply is the last thing to happen, not the first.</text>
<rect x="20" y="276" width="150" height="34" rx="5" class="box-accent"/>
<text x="95" y="298" text-anchor="middle" class="t-sm">1. log entry to B</text>
<rect x="190" y="276" width="150" height="34" rx="5" class="box-accent"/>
<text x="265" y="298" text-anchor="middle" class="t-sm">2. B acknowledges</text>
<rect x="360" y="276" width="150" height="34" rx="5" class="box-accent"/>
<text x="435" y="298" text-anchor="middle" class="t-sm">3. A sets counter = 11</text>
<rect x="530" y="276" width="150" height="34" rx="5" class="box-accent"/>
<text x="605" y="298" text-anchor="middle" class="t-sm">4. A replies "11"</text>
<line x1="174" y1="293" x2="186" y2="293" class="arrow arrow-accent" marker-end="url(#or-b)"/>
<line x1="344" y1="293" x2="356" y2="293" class="arrow arrow-accent" marker-end="url(#or-b)"/>
<line x1="514" y1="293" x2="526" y2="293" class="arrow arrow-accent" marker-end="url(#or-b)"/>
<text x="20" y="340" class="t-sm">Now a reply is only ever sent once the backup could reproduce it.</text>
<text x="20" y="360" class="t-sm">The cost is a network round trip on the critical path of every single request.</text>
</svg>
<figcaption>The reply has to be the last thing that happens, not the first.</figcaption>
</figure>

Say the primary holds a counter at 10 and a client asks it to add one. The natural implementation: update the counter to 11, reply "11" to the client, send the log entry to the backup.

Now suppose that log entry never arrives.

The primary dies. The backup, having heard nothing, goes live still holding 10 — while the client is holding a receipt that says 11. The system has told someone about a state it no longer has. No amount of retrying recovers this, because the client believes something that is no longer true anywhere.

The fix is the **Output Rule**, and it inverts the order. Before the primary sends any reply to the client, it sends the log entry to the backup and *waits for an acknowledgement*. Only then does it respond.

The rule is: never tell the outside world about a state the backup couldn't reproduce.

The cost is exactly what it looks like. Every request that produces output now has a network round trip to the backup on its critical path. All that bandwidth saved by choosing a replicated state machine, and you pay it back in latency — not for the replication itself, but for the ordering guarantee that makes the replication safe.

## Both of them think they're in charge

The last problem is the oldest one in distributed systems. The network between primary and backup fails, but both machines are fine.

The backup sees a silent log channel and concludes the primary is dead — which is exactly what it should conclude, because a dead primary and an unreachable one look identical from where it is standing. So it goes live. Now there are two primaries, both serving clients, both diverging.

Nothing the two of them can say to each other resolves this, because the problem *is* that they can't talk. So the answer comes from outside: a third party holding a **test-and-set** lock. Before either machine goes live it must acquire that lock, and the lock grants only once. The primary that's still running holds it; the backup tries, fails, and stays suppressed.

That's the shape of every split-brain solution — an external arbiter that can only say yes once. It also relocates the problem rather than removing it, since now something else has to not fail. In practice that something is a replicated service of its own, which is a decent illustration of how these systems end up stacked on one another.

## What it costs

Read back through the fixes and a pattern shows up. Interrupts, non-deterministic instructions, multicore, output ordering, split brain — each one is solved by removing a degree of freedom.

Don't let the backup take its own interrupts. Don't let it execute its own time instructions. Don't let it have more than one core. Don't let the primary reply until the backup agrees. Don't let either go live without external permission.

The elegance of "just run the same instructions twice" survives, but only inside a box built entirely out of restrictions. The idea was never wrong. It just turns out that the amount of non-determinism in a real machine is enormous, and every last bit of it has to be either logged away or forbidden.

Which is, I think, the actual lesson, and it generalises well past this one system: a replication scheme is mostly a list of things you have decided the machine is no longer allowed to do.

## Sources

- [MIT 6.824 Distributed Systems](https://pdos.csail.mit.edu/6.824/) — the course these notes came from
- Scales, Nelson, Venkitachalam — [The Design of a Practical System for Fault-Tolerant Virtual Machines](https://pdos.csail.mit.edu/6.824/papers/vm-ft.pdf), the VMware FT paper
- [6.824 schedule and lecture notes](https://pdos.csail.mit.edu/6.824/schedule.html)

Diagrams are my own.

