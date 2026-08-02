---
title: Linux is not an operating system
description: >-
  One boundary in your machine is enforced by the CPU. The other is an argument
  people have been having for thirty years — and only one of them is called 'the
  OS'.
date: '2026-08-02'
category: os
tags: []
draft: false
source: os/os vs kernel.md
updated: '2026-08-02'
---

Linux is a kernel. It is not an operating system, and the thing you installed on your laptop is a distribution — a kernel plus several thousand programs somebody chose for you.

That sounds like pedantry. It stops sounding like pedantry once you notice there are two different boundaries in play here, that they're drawn in completely different ways, and that people routinely confuse them.

One is enforced by the processor. The other is a matter of opinion.

## The boundary that's real

<figure class="diagram">
<svg viewBox="0 0 700 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="User space and kernel space separated by a hardware-enforced privilege boundary, with the system call as the only crossing">
<defs>
<marker id="pb-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="pb-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<text x="20" y="24" class="t-sm t-strong">user space — unprivileged</text>
<rect x="20" y="38" width="112" height="40" rx="5" class="box"/><text x="76" y="63" text-anchor="middle" class="t-sm">your program</text>
<rect x="142" y="38" width="90" height="40" rx="5" class="box"/><text x="187" y="63" text-anchor="middle" class="t-sm">bash</text>
<rect x="242" y="38" width="90" height="40" rx="5" class="box"/><text x="287" y="63" text-anchor="middle" class="t-sm">systemd</text>
<rect x="342" y="38" width="110" height="40" rx="5" class="box"/><text x="397" y="63" text-anchor="middle" class="t-sm">package mgr</text>
<rect x="462" y="38" width="90" height="40" rx="5" class="box"/><text x="507" y="63" text-anchor="middle" class="t-sm">browser</text>
<rect x="562" y="38" width="118" height="40" rx="5" class="box"/><text x="621" y="63" text-anchor="middle" class="t-sm">window mgr</text>
<line x1="20" y1="132" x2="680" y2="132" class="arrow arrow-accent"/>
<text x="20" y="104" class="t-sm t-accent t-strong">the privilege boundary — enforced by the CPU</text>
<rect x="272" y="112" width="156" height="40" rx="5" class="box-accent fill-bg"/>
<text x="350" y="137" text-anchor="middle" class="t-mono t-accent">syscall</text>
<line x1="350" y1="82" x2="350" y2="108" class="arrow arrow-accent" marker-end="url(#pb-b)"/>
<line x1="350" y1="156" x2="350" y2="184" class="arrow arrow-accent" marker-end="url(#pb-b)"/>
<text x="444" y="104" class="t-sm">the only way across</text>
<text x="20" y="208" class="t-sm t-strong">kernel space — privileged</text>
<rect x="20" y="220" width="150" height="40" rx="5" class="box-accent"/><text x="95" y="245" text-anchor="middle" class="t-sm t-accent">scheduler</text>
<rect x="180" y="220" width="150" height="40" rx="5" class="box-accent"/><text x="255" y="245" text-anchor="middle" class="t-sm t-accent">memory manager</text>
<rect x="340" y="220" width="150" height="40" rx="5" class="box-accent"/><text x="415" y="245" text-anchor="middle" class="t-sm t-accent">filesystems</text>
<rect x="500" y="220" width="180" height="40" rx="5" class="box-accent"/><text x="590" y="245" text-anchor="middle" class="t-sm t-accent">drivers</text>
<rect x="20" y="272" width="660" height="34" rx="5" class="box"/>
<text x="350" y="294" text-anchor="middle" class="t-sm">hardware — reachable from above this line and nowhere else</text>
</svg>
<figcaption>The line across the middle is not a diagram convention. It's a CPU mode.</figcaption>
</figure>

Your processor runs code at different privilege levels. In the privileged one, code can touch hardware directly — talk to devices, change the page tables, mask interrupts. In the unprivileged one, it can't. Try, and the CPU faults.

Everything that genuinely requires hardware access lives on the privileged side, and that's the kernel: the scheduler, the memory manager, the filesystem implementations, the device drivers. Everything else runs unprivileged, and when it needs something from the hardware it has to ask.

That asking is the **system call**, and it's the only crossing. There is exactly one door in that wall, it's guarded, and you go through it or you don't get in.

This boundary has none of the ambiguity people bring to the word "operating system". It's not a design philosophy or a naming convention. It's a bit in a register, checked by silicon, on every instruction.

## The boundary that isn't

Now: which of the programs on the unprivileged side are "the operating system"?

Your shell is a normal user-space process. So is your init system, your package manager, your window manager, your text editor. They run at the same privilege level as a Python script you wrote this morning. The CPU cannot tell them apart, and neither can the kernel — to the scheduler they're all just processes with PIDs.

So the answer is: whichever ones we've agreed to call the operating system. That's it. There's no mechanism enforcing it, no flag on the process, nothing in the kernel that knows the difference. It's a naming convention that happens to be widely shared.

Which is precisely why distributions can exist.

<figure class="diagram">
<svg viewBox="0 0 700 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three Linux distributions sharing the same kernel and differing only in the user-space programs stacked on top of it">
<text x="20" y="24" class="t-sm t-strong">what actually differs between distributions</text>
<rect x="20" y="40" width="200" height="130" rx="6" class="box"/>
<text x="120" y="64" text-anchor="middle" class="t-strong">Debian</text>
<rect x="36" y="78" width="168" height="24" rx="3" class="box fill-bg"/><text x="120" y="95" text-anchor="middle" class="t-sm">apt · dpkg</text>
<rect x="36" y="106" width="168" height="24" rx="3" class="box fill-bg"/><text x="120" y="123" text-anchor="middle" class="t-sm">systemd</text>
<rect x="36" y="134" width="168" height="24" rx="3" class="box fill-bg"/><text x="120" y="151" text-anchor="middle" class="t-sm">stability first</text>
<rect x="250" y="40" width="200" height="130" rx="6" class="box"/>
<text x="350" y="64" text-anchor="middle" class="t-strong">Arch</text>
<rect x="266" y="78" width="168" height="24" rx="3" class="box fill-bg"/><text x="350" y="95" text-anchor="middle" class="t-sm">pacman</text>
<rect x="266" y="106" width="168" height="24" rx="3" class="box fill-bg"/><text x="350" y="123" text-anchor="middle" class="t-sm">systemd</text>
<rect x="266" y="134" width="168" height="24" rx="3" class="box fill-bg"/><text x="350" y="151" text-anchor="middle" class="t-sm">newest first</text>
<rect x="480" y="40" width="200" height="130" rx="6" class="box"/>
<text x="580" y="64" text-anchor="middle" class="t-strong">Alpine</text>
<rect x="496" y="78" width="168" height="24" rx="3" class="box fill-bg"/><text x="580" y="95" text-anchor="middle" class="t-sm">apk</text>
<rect x="496" y="106" width="168" height="24" rx="3" class="box fill-bg"/><text x="580" y="123" text-anchor="middle" class="t-sm">OpenRC · musl</text>
<rect x="496" y="134" width="168" height="24" rx="3" class="box fill-bg"/><text x="580" y="151" text-anchor="middle" class="t-sm">smallest first</text>
<text x="20" y="192" class="t-sm">↑ all user space · all replaceable · this is the entire difference</text>
<rect x="20" y="208" width="660" height="48" rx="6" class="box-accent"/>
<text x="350" y="230" text-anchor="middle" class="t-strong t-accent">the Linux kernel</text>
<text x="350" y="248" text-anchor="middle" class="t-sm">identical in all three</text>
<text x="20" y="282" class="t-sm">A distribution is a set of opinions about which user-space programs you should have.</text>
</svg>
<figcaption>The same kernel in all three. Everything above it is a choice.</figcaption>
</figure>

Debian, Arch and Alpine run the same kernel. What differs is the user-space collection stacked on top and the philosophy behind the choices: what the package manager is, whether init is systemd or OpenRC, whether the C library is glibc or musl, how aggressively new versions land.

That's the whole of it. When people argue about distributions they are arguing about user-space programs and the taste behind selecting them. The part that actually manages your hardware is identical.

## PID 1

There's one user-space process the kernel does treat specially, and only at the very beginning.

<figure class="diagram">
<svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The kernel starts one user-space process, PID 1, and every other process descends from it">
<defs>
<marker id="pr-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<rect x="250" y="20" width="200" height="38" rx="5" class="box"/>
<text x="350" y="44" text-anchor="middle" class="t-sm">the kernel boots</text>
<line x1="350" y1="62" x2="350" y2="84" class="arrow" marker-end="url(#pr-a)"/>
<rect x="250" y="88" width="200" height="46" rx="6" class="box-accent"/>
<text x="350" y="110" text-anchor="middle" class="t-strong t-accent">systemd</text>
<text x="350" y="128" text-anchor="middle" class="t-mono t-sm">pid 1</text>
<line x1="300" y1="138" x2="150" y2="176" class="arrow" marker-end="url(#pr-a)"/>
<line x1="350" y1="138" x2="350" y2="176" class="arrow" marker-end="url(#pr-a)"/>
<line x1="400" y1="138" x2="550" y2="176" class="arrow" marker-end="url(#pr-a)"/>
<rect x="70" y="180" width="160" height="34" rx="5" class="box"/><text x="150" y="202" text-anchor="middle" class="t-sm">sshd</text>
<rect x="270" y="180" width="160" height="34" rx="5" class="box"/><text x="350" y="202" text-anchor="middle" class="t-sm">display manager</text>
<rect x="470" y="180" width="160" height="34" rx="5" class="box"/><text x="550" y="202" text-anchor="middle" class="t-sm">cron</text>
<line x1="150" y1="218" x2="150" y2="238" class="arrow" marker-end="url(#pr-a)"/>
<line x1="350" y1="218" x2="350" y2="238" class="arrow" marker-end="url(#pr-a)"/>
<rect x="70" y="242" width="160" height="34" rx="5" class="box"/><text x="150" y="264" text-anchor="middle" class="t-sm">your shell</text>
<rect x="270" y="242" width="160" height="34" rx="5" class="box"/><text x="350" y="264" text-anchor="middle" class="t-sm">your desktop</text>
<text x="20" y="112" class="t-sm">A compiled C</text>
<text x="20" y="130" class="t-sm">program, sitting</text>
<text x="20" y="148" class="t-mono t-sm">/sbin/init</text>
<text x="470" y="112" class="t-sm">Alive until shutdown.</text>
<text x="470" y="130" class="t-sm">Everything else on the</text>
<text x="470" y="148" class="t-sm">machine descends from it.</text>
<text x="20" y="296" class="t-sm">The kernel starts exactly one program. Every other process is that program's child, or its child's child.</text>
</svg>
<figcaption>The kernel starts one program. Everything else descends from it.</figcaption>
</figure>

When the kernel finishes booting, it starts exactly one user-space program — `init`, these days usually systemd, sitting on disk in `/sbin` as an ordinary compiled C binary. It gets PID 1. It stays alive until shutdown.

Every other process on the machine is its child, or its child's child. Your shell, your browser, the daemon you're debugging: trace the parents back far enough and you always land on PID 1.

I like this because of how thin the special treatment is. The kernel doesn't manage user space — it starts one program and hands over. Everything you think of as "the system booting" is that one process reading its configuration and starting things, which start other things.

## The line moves

The best detail in my notes on this is the one I hadn't thought about before writing them down: **where the boundary sits changes over time, and it changes for non-technical reasons.**

A browser is part of the operating system now. Ship a desktop OS without one and it's incomplete. Twenty years ago a browser was obviously an application you installed — and the question of whether bundling one made it part of the OS was argued in court, at length, with billions of dollars on it.

Nothing technical changed. Browsers didn't acquire a new privilege level. What changed is what people expect a machine to come with.

Which is the whole point. One of these boundaries is a fact about your CPU. The other is a fact about what we currently expect, and it drifts.

Worth keeping them apart when you're reasoning about a system — because when something breaks, only one of them determines what can actually touch the hardware.

## Sources

- [Core Dumped](https://www.youtube.com/@CoreDumpped) — the channel these notes came from
- [The Linux Kernel documentation](https://docs.kernel.org/)
- [systemd(1)](https://man7.org/linux/man-pages/man1/init.1.html) · [syscalls(2)](https://man7.org/linux/man-pages/man2/syscalls.2.html)

Diagrams are my own.

