---
title: Your process's memory is a lie
description: >-
  A process sees a tidy, private, enormous address space. None of it is real,
  all of it is maintained by a table — and the shortcut that made it fast is why
  Meltdown happened.
date: '2026-08-02'
category: os
tags:
  - linux
  - kernel
  - memory
  - security
draft: false
source: os/Process.md
updated: '2026-08-02'
---

A running process sees a clean, contiguous block of memory belonging entirely to it, starting at address zero and running to something absurd like 256 terabytes. Code at the bottom, heap growing up, stack growing down, plenty of room in between.

Almost none of that is true. The memory isn't contiguous, most of it doesn't exist, and the parts that do are scattered across RAM in no particular order, interleaved with pages belonging to programs the process has never heard of.

The fiction is maintained by a table, consulted by hardware, on every single memory access. And the shortcut that made that fiction fast is the reason Meltdown happened.

## What the process thinks it has

<figure class="diagram">
<svg viewBox="0 0 700 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A process's virtual address space: kernel mapped at the top, stack growing down, heap growing up, thread stacks in the gap separated by guard pages">
<defs>
<marker id="as-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<text x="20" y="24" class="t-sm t-strong">what the process believes it has</text>
<rect x="20" y="40" width="230" height="46" rx="4" class="box-accent"/>
<text x="135" y="62" text-anchor="middle" class="t-sm t-accent">kernel</text>
<text x="135" y="78" text-anchor="middle" class="t-sm">mapped into every process</text>
<rect x="20" y="94" width="230" height="34" rx="4" class="box"/>
<text x="135" y="115" text-anchor="middle" class="t-sm">main thread stack</text>
<line x1="135" y1="134" x2="135" y2="152" class="arrow" marker-end="url(#as-a)"/>
<text x="150" y="148" class="t-sm">grows down</text>
<rect x="20" y="160" width="230" height="26" rx="3" class="box-ghost"/>
<text x="135" y="178" text-anchor="middle" class="t-sm">thread 2 stack</text>
<rect x="20" y="190" width="230" height="14" rx="2" class="box"/>
<text x="264" y="201" class="t-sm">guard</text>
<rect x="20" y="208" width="230" height="26" rx="3" class="box-ghost"/>
<text x="135" y="226" text-anchor="middle" class="t-sm">thread 3 stack</text>
<line x1="135" y1="268" x2="135" y2="250" class="arrow" marker-end="url(#as-a)"/>
<text x="150" y="266" class="t-sm">grows up</text>
<rect x="20" y="276" width="230" height="34" rx="4" class="box"/>
<text x="135" y="297" text-anchor="middle" class="t-sm">heap</text>
<rect x="20" y="318" width="230" height="30" rx="4" class="box"/>
<text x="135" y="337" text-anchor="middle" class="t-sm">data</text>
<rect x="20" y="352" width="230" height="30" rx="4" class="box"/>
<text x="135" y="371" text-anchor="middle" class="t-sm">code</text>
<line x1="300" y1="34" x2="300" y2="386" class="rule"/>
<text x="326" y="60" class="t-sm">On a 64-bit machine the address space is</text>
<text x="326" y="78" class="t-sm">so large that the gap between stack and</text>
<text x="326" y="96" class="t-sm">heap is effectively unlimited. Nothing is</text>
<text x="326" y="114" class="t-sm">crowded. Almost none of it is real.</text>
<text x="326" y="152" class="t-sm t-strong">Thread stacks live in that gap</text>
<text x="326" y="176" class="t-sm">The main thread keeps the process stack.</text>
<text x="326" y="194" class="t-sm">Every thread after it gets one carved out</text>
<text x="326" y="212" class="t-sm">of the space between stack and heap.</text>
<text x="326" y="240" class="t-sm">A guard page sits between them — an</text>
<text x="326" y="258" class="t-sm">unmapped page, so a stack that overruns</text>
<text x="326" y="276" class="t-sm">faults instead of quietly writing into its</text>
<text x="326" y="294" class="t-sm">neighbour.</text>
<text x="326" y="332" class="t-sm">Each thread's program counter and</text>
<text x="326" y="350" class="t-sm">registers live in the process's PCB, in</text>
<text x="326" y="368" class="t-sm">kernel memory.</text>
</svg>
<figcaption>The layout every process believes in. The kernel is up there in all of them.</figcaption>
</figure>

Code at the bottom, then initialised data, then the heap growing upward. The stack sits high and grows down. On a 64-bit machine the space between them is so vast that neither will ever reach the other — you run out of physical memory, or patience, long before you run out of address space.

Two details in that picture matter later.

**Thread stacks are carved out of the gap.** The main thread keeps the process stack, and every thread created after it gets a region allocated in the space between stack and heap. Between them sit **guard pages**: deliberately unmapped pages that exist in order to be invalid. A stack that overruns its bounds hits one and faults immediately, rather than quietly corrupting the neighbouring thread's stack and producing a bug that surfaces somewhere else entirely, hours later.

**And the kernel is mapped in at the top.** Every process's address space contains the kernel. Not a copy — the same physical kernel pages, mapped into all of them. Hold onto that.

## What's actually there

<figure class="diagram">
<svg viewBox="0 0 700 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contiguous virtual pages map through a per-process page table to physical frames scattered anywhere in RAM">
<defs>
<marker id="pt-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="pt-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<text x="20" y="24" class="t-sm t-strong">virtual — tidy</text>
<rect x="20" y="40" width="130" height="30" rx="3" class="box-accent"/><text x="85" y="60" text-anchor="middle" class="t-mono">page 0</text>
<rect x="20" y="76" width="130" height="30" rx="3" class="box-accent"/><text x="85" y="96" text-anchor="middle" class="t-mono">page 1</text>
<rect x="20" y="112" width="130" height="30" rx="3" class="box-accent"/><text x="85" y="132" text-anchor="middle" class="t-mono">page 2</text>
<rect x="20" y="148" width="130" height="30" rx="3" class="box-accent"/><text x="85" y="168" text-anchor="middle" class="t-mono">page 3</text>
<rect x="240" y="60" width="150" height="120" rx="6" class="box"/>
<text x="315" y="86" text-anchor="middle" class="t-strong">MMU</text>
<text x="315" y="110" text-anchor="middle" class="t-sm">walks the page</text>
<text x="315" y="128" text-anchor="middle" class="t-sm">table for this</text>
<text x="315" y="146" text-anchor="middle" class="t-sm">process</text>
<text x="315" y="168" text-anchor="middle" class="t-sm">on every access</text>
<line x1="156" y1="106" x2="234" y2="112" class="arrow" marker-end="url(#pt-a)"/>
<text x="530" y="24" class="t-sm t-strong">physical — wherever there was room</text>
<rect x="500" y="40" width="170" height="24" rx="3" class="box"/><text x="585" y="57" text-anchor="middle" class="t-sm">someone else</text>
<rect x="500" y="68" width="170" height="24" rx="3" class="box-accent"/><text x="585" y="85" text-anchor="middle" class="t-mono">page 2</text>
<rect x="500" y="96" width="170" height="24" rx="3" class="box"/><text x="585" y="113" text-anchor="middle" class="t-sm">someone else</text>
<rect x="500" y="124" width="170" height="24" rx="3" class="box-accent"/><text x="585" y="141" text-anchor="middle" class="t-mono">page 0</text>
<rect x="500" y="152" width="170" height="24" rx="3" class="box-accent"/><text x="585" y="169" text-anchor="middle" class="t-mono">page 3</text>
<rect x="500" y="180" width="170" height="24" rx="3" class="box"/><text x="585" y="197" text-anchor="middle" class="t-sm">free</text>
<rect x="500" y="208" width="170" height="24" rx="3" class="box-accent"/><text x="585" y="225" text-anchor="middle" class="t-mono">page 1</text>
<line x1="396" y1="112" x2="494" y2="80" class="arrow arrow-accent" marker-end="url(#pt-b)"/>
<line x1="396" y1="120" x2="494" y2="136" class="arrow arrow-accent" marker-end="url(#pt-b)"/>
<line x1="396" y1="128" x2="494" y2="164" class="arrow arrow-accent" marker-end="url(#pt-b)"/>
<line x1="396" y1="136" x2="494" y2="220" class="arrow arrow-accent" marker-end="url(#pt-b)"/>
<line x1="20" y1="252" x2="680" y2="252" class="rule"/>
<text x="20" y="280" class="t-sm">The order and the adjacency are entirely fictional. Neighbouring virtual pages can sit at</text>
<text x="20" y="298" class="t-sm">opposite ends of RAM, and the process is never told. One page table per process — its</text>
<text x="20" y="316" class="t-sm">address lives in a register, saved and restored on every context switch.</text>
</svg>
<figcaption>Tidy on the left, chaos on the right. The process only ever sees the left.</figcaption>
</figure>

Physical memory is handed out in fixed-size chunks called frames, and it's handed out wherever there's room. Your virtual page 0 and page 1 are adjacent in the fiction and can sit at opposite ends of RAM in fact.

Reconciling those is the **page table**: one per process, mapping virtual pages to physical frames. The **MMU** — hardware, not software — walks it on every access and rewrites the address before it reaches the memory bus.

Which means translation happens for every instruction fetch, every load, every store, on every core, constantly. It has to be in hardware. Doing it in software would be like putting an interpreter on the memory bus.

The page table's address lives in a register, and that register is part of what gets saved and restored on a context switch — alongside the program counter and the rest of the register file, in the process's **PCB**, which lives in kernel memory. Switching processes is, from memory's point of view, mostly a matter of changing which table the MMU is looking at. Change the table and the same virtual address means something completely different.

For threads it's the same story minus the swap. Threads share an address space, so what's saved per thread is the program counter and registers, not the mapping.

## Asking for more

Your program calls `malloc`. Underneath, there are two ways it can get memory from the kernel, and the difference between them explains a class of behaviour that otherwise looks like a bug.

<figure class="diagram">
<svg viewBox="0 0 700 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="sbrk can only move the top of the heap so a freed block in the middle cannot be returned; mmap can map and unmap any region independently">
<defs>
<marker id="sm-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="sm-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<text x="20" y="24" class="t-strong t-mono">sbrk</text>
<text x="86" y="24" class="t-sm">— one pointer, at the top</text>
<rect x="20" y="42" width="200" height="30" rx="3" class="box"/><text x="120" y="62" text-anchor="middle" class="t-sm">in use</text>
<rect x="20" y="76" width="200" height="30" rx="3" class="box-ghost"/><text x="120" y="96" text-anchor="middle" class="t-sm">freed</text>
<rect x="20" y="110" width="200" height="30" rx="3" class="box"/><text x="120" y="130" text-anchor="middle" class="t-sm">in use</text>
<line x1="234" y1="42" x2="234" y2="22" class="arrow" marker-end="url(#sm-a)"/>
<text x="246" y="34" class="t-sm">the break — the only</text>
<text x="246" y="52" class="t-sm">thing you can move</text>
<text x="246" y="92" class="t-sm">The freed block in the middle</text>
<text x="246" y="110" class="t-sm">cannot go back to the kernel.</text>
<text x="246" y="128" class="t-sm">Lowering the break would take</text>
<text x="246" y="146" class="t-sm">the live block below it too.</text>
<line x1="20" y1="176" x2="680" y2="176" class="rule"/>
<text x="20" y="206" class="t-strong t-mono t-accent">mmap</text>
<text x="96" y="206" class="t-sm">— independent regions</text>
<rect x="20" y="224" width="200" height="26" rx="3" class="box-accent"/><text x="120" y="242" text-anchor="middle" class="t-sm">mapped</text>
<rect x="20" y="254" width="200" height="26" rx="3" class="box-ghost"/><text x="120" y="272" text-anchor="middle" class="t-sm">unmapped, returned</text>
<rect x="20" y="284" width="200" height="26" rx="3" class="box-accent"/><text x="120" y="302" text-anchor="middle" class="t-sm">mapped</text>
<line x1="234" y1="267" x2="270" y2="267" class="arrow arrow-accent" marker-end="url(#sm-b)"/>
<text x="284" y="242" class="t-sm">Any region can be released on its own,</text>
<text x="284" y="260" class="t-sm">which is why malloc reaches for mmap</text>
<text x="284" y="278" class="t-sm">on large allocations.</text>
<text x="284" y="306" class="t-sm">It also maps files — and only the pages you touch are ever read.</text>
</svg>
<figcaption>One pointer at the top, versus regions you can release individually.</figcaption>
</figure>

**`sbrk` moves one pointer** — the top of the heap, the "break". Push it up and you have more heap; pull it down and you have less. That is the entire interface, and it's fine right up until you free something in the middle.

You can't give that middle block back. Lowering the break would also release the still-live block sitting above it. So the freed memory stays mapped, stays counted against your process, and gets reused by a later allocation if one happens to fit. This is why a program's memory usage often doesn't drop after it frees a lot of memory — nothing is leaking, the allocator just has no way to return that particular hole.

**`mmap` maps a region independently**, and any region can be unmapped on its own. That's why allocators reach for `mmap` on large allocations: a big block gets its own mapping and can genuinely go back to the kernel when it's freed.

`mmap` also maps files. Point it at a file on disk and you get an address range that *is* the file. Nothing is read up front — pages arrive as you touch them, faulted in on demand. Which is the general principle underneath all of this: **an address space is a promise, not an allocation.** Ask for a gigabyte and you get a gigabyte of addresses. Physical memory only shows up when you actually touch a page.

## When there isn't enough

That promise can be over-committed, and eventually the machine has to make good on it.

If the set of pages processes are actively using exceeds physical memory, every process starts evicting pages that another process is about to want. The system spends its time shuttling pages between disk and RAM, and the CPU does more context switching than useful work. That's **thrashing**, and its characteristic sign is a machine that is neither idle nor progressing — fully occupied doing bookkeeping.

The idea that fixes it is the **working set**: track which pages a process has touched recently and keep that set resident, rather than treating every page as equally evictable. If a process's working set won't fit, it's better to run fewer processes than to let all of them thrash.

That rests on **locality of reference** — that a program which touched an address recently will probably touch it again (temporal), and having touched one address will probably touch its neighbours (spatial). Not a law, just overwhelmingly true of real programs, and enough to build on.

## The same idea, several layers down

Locality shows up again in hardware, doing the same job at a different scale. CPU caches hold recently used lines on the assumption you'll want them again, and fetch whole lines rather than single bytes on the assumption you'll want the neighbours.

The vocabulary mirrors the page discussion exactly: hit ratio, miss ratio, and miss penalty — what you pay when the guess is wrong. The organisation question is where a given address is *allowed* to live. **Direct mapped** gives each address exactly one slot, which is fast to check and collides badly. **Fully associative** lets any line go anywhere, which never collides needlessly and is expensive to search. **Set associative** splits the difference, and is what real caches do.

It's worth noticing. The page table deciding which pages stay in RAM and the cache deciding which lines stay in L1 are the same problem, solved the same way, at different distances from the CPU.

## Where the fiction leaked

Back to the kernel being mapped into every process.

That was a performance decision, and a reasonable one. A system call is a jump into kernel code, and if the kernel is already in your page table then no swap is needed — change privilege level and go. Making syscalls cheap is worth a great deal, and the kernel pages were marked as requiring supervisor privilege, so user code couldn't read them.

Then **Meltdown**.

Modern processors execute speculatively, running ahead down a likely path before knowing whether they should. The permission check on those kernel pages did happen — and the speculative read happened *first*. The results were discarded once the check failed, but the read had already disturbed the CPU caches, and cache state can be measured through timing. The data was never architecturally visible, and was recoverable anyway.

The fix, **KPTI**, is to stop mapping the kernel into user address space at all.

<figure class="diagram">
<svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Before Meltdown one page table held both user and kernel mappings; after KPTI the kernel gets its own table, swapped in on every entry to the kernel">
<defs>
<marker id="kp-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<text x="20" y="24" class="t-strong">before</text>
<text x="96" y="24" class="t-sm">— one table, both worlds in it</text>
<rect x="20" y="42" width="240" height="118" rx="6" class="box"/>
<text x="140" y="66" text-anchor="middle" class="t-sm t-strong">one page table</text>
<rect x="36" y="80" width="208" height="30" rx="3" class="box-accent"/>
<text x="140" y="100" text-anchor="middle" class="t-sm t-accent">kernel pages</text>
<rect x="36" y="118" width="208" height="30" rx="3" class="box"/>
<text x="140" y="138" text-anchor="middle" class="t-sm">user pages</text>
<text x="278" y="66" class="t-sm">A syscall needed no table swap,</text>
<text x="278" y="84" class="t-sm">which made it fast. That was the</text>
<text x="278" y="102" class="t-sm">entire reason for the design.</text>
<text x="278" y="132" class="t-sm">But the kernel was addressable</text>
<text x="278" y="150" class="t-sm">from user code — protected only</text>
<text x="278" y="168" class="t-sm">by a permission check that</text>
<text x="278" y="186" class="t-sm">speculation ran ahead of.</text>
<line x1="20" y1="196" x2="680" y2="196" class="rule"/>
<text x="20" y="226" class="t-strong t-accent">after KPTI</text>
<text x="128" y="226" class="t-sm">— two tables, swapped at the boundary</text>
<rect x="20" y="244" width="150" height="44" rx="5" class="box"/>
<text x="95" y="264" text-anchor="middle" class="t-sm">user table</text>
<text x="95" y="280" text-anchor="middle" class="t-sm">no kernel in it</text>
<line x1="176" y1="266" x2="216" y2="266" class="arrow" marker-start="url(#kp-a)" marker-end="url(#kp-a)"/>
<text x="196" y="256" text-anchor="middle" class="t-sm">swap</text>
<rect x="222" y="244" width="150" height="44" rx="5" class="box-accent"/>
<text x="297" y="264" text-anchor="middle" class="t-sm t-accent">kernel table</text>
<text x="297" y="280" text-anchor="middle" class="t-sm">used inside the kernel</text>
<text x="396" y="262" class="t-sm">The kernel is no longer addressable from user</text>
<text x="396" y="280" class="t-sm">space at all — and every syscall pays for it.</text>
</svg>
<figcaption>Two tables instead of one, and a swap at every boundary.</figcaption>
</figure>

Two page tables per process: one for user mode with the kernel absent, one for kernel mode. Every entry into the kernel swaps tables, and every return swaps back.

Which puts back precisely the cost the original design existed to avoid. Every syscall now pays for a page table switch and the flushing that comes with it. That's the real shape of the thing — a mapping chosen to make the common path fast turned out to be reachable through a channel nobody was modelling, and the fix was to give the speed up.

The fiction still holds. It just got more expensive to maintain.

## Sources

- [Core Dumped](https://www.youtube.com/@CoreDumpped) — the channel these notes came from
- [Meltdown](https://meltdownattack.com/) — the paper and disclosure
- [Page table isolation, kernel docs](https://docs.kernel.org/x86/pti.html)
- man pages: [mmap(2)](https://man7.org/linux/man-pages/man2/mmap.2.html) · [brk(2) / sbrk(2)](https://man7.org/linux/man-pages/man2/brk.2.html)

Diagrams are my own.

