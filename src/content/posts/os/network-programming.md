---
title: Network Programming
description: >-
  The sockets API in the order you actually call it — which calls block, what
  accept really hands back, and why a port number isn't a door.
date: '2026-08-01'
category: os
tags:
  - networking
  - concurrency
  - linux
draft: false
source: os/Network Programming.md
updated: '2026-08-01'
---

Every sockets tutorial gives you the same thing: one client, one server, about forty lines of C, and a promise that you now know network programming. Then you close the tab and could not tell me what `accept()` returns, or which of those calls is about to freeze your program.

The list of functions is short enough to memorise in an afternoon. What takes longer is the shape underneath it — which calls are asking the kernel to do something, which are asking it to *wait*, and what the kernel is quietly doing on your behalf while you think you're just writing bytes.

So this is the sockets API in the order you actually call it.

## The two sequences

Here is the whole TCP conversation, both sides at once.

<figure class="diagram">
<svg viewBox="0 0 700 440" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The TCP call sequence on client and server, showing which calls block and where the three-way handshake happens">
<defs>
<marker id="ts-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<text x="120" y="26" text-anchor="middle" class="t-strong">client</text>
<text x="450" y="26" text-anchor="middle" class="t-strong">server</text>
<rect x="30" y="40" width="180" height="34" rx="5" class="box"/>
<text x="120" y="62" text-anchor="middle" class="t-mono">getaddrinfo()</text>
<rect x="30" y="84" width="180" height="34" rx="5" class="box"/>
<text x="120" y="106" text-anchor="middle" class="t-mono">socket()</text>
<rect x="30" y="128" width="180" height="34" rx="5" class="box"/>
<text x="120" y="150" text-anchor="middle" class="t-mono">bind()</text>
<rect x="30" y="172" width="180" height="34" rx="5" class="box-accent"/>
<text x="120" y="194" text-anchor="middle" class="t-mono t-accent">connect()</text>
<rect x="30" y="260" width="180" height="34" rx="5" class="box"/>
<text x="120" y="282" text-anchor="middle" class="t-mono">send()</text>
<rect x="30" y="304" width="180" height="34" rx="5" class="box-accent"/>
<text x="120" y="326" text-anchor="middle" class="t-mono t-accent">recv()</text>
<rect x="30" y="348" width="180" height="34" rx="5" class="box"/>
<text x="120" y="370" text-anchor="middle" class="t-mono">close()</text>
<rect x="360" y="84" width="180" height="34" rx="5" class="box"/>
<text x="450" y="106" text-anchor="middle" class="t-mono">socket()</text>
<rect x="360" y="128" width="180" height="34" rx="5" class="box"/>
<text x="450" y="150" text-anchor="middle" class="t-mono">bind()</text>
<rect x="360" y="172" width="180" height="34" rx="5" class="box"/>
<text x="450" y="194" text-anchor="middle" class="t-mono">listen()</text>
<rect x="360" y="216" width="180" height="34" rx="5" class="box-accent"/>
<text x="450" y="238" text-anchor="middle" class="t-mono t-accent">accept()</text>
<rect x="360" y="260" width="180" height="34" rx="5" class="box-accent"/>
<text x="450" y="282" text-anchor="middle" class="t-mono t-accent">recv()</text>
<rect x="360" y="304" width="180" height="34" rx="5" class="box"/>
<text x="450" y="326" text-anchor="middle" class="t-mono">send()</text>
<rect x="360" y="348" width="180" height="34" rx="5" class="box"/>
<text x="450" y="370" text-anchor="middle" class="t-mono">close()</text>
<path d="M 214 189 H 288 V 233 H 356" class="arrow" marker-end="url(#ts-a)"/>
<text x="286" y="212" text-anchor="middle" class="t-sm">handshake</text>
<line x1="214" y1="277" x2="356" y2="277" class="arrow arrow-dash" marker-end="url(#ts-a)"/>
<line x1="356" y1="321" x2="214" y2="321" class="arrow arrow-dash" marker-end="url(#ts-a)"/>
<rect x="566" y="216" width="112" height="78" rx="5" class="box-ghost"/>
<text x="622" y="242" text-anchor="middle" class="t-sm t-accent">outlined calls</text>
<text x="622" y="262" text-anchor="middle" class="t-sm">block until the</text>
<text x="622" y="280" text-anchor="middle" class="t-sm">other side acts</text>
<text x="30" y="412" class="t-sm">The client's bind() is optional. Skip it and the kernel picks an ephemeral port.</text>
<text x="30" y="430" class="t-sm">Only the client calls getaddrinfo, because only the client has a name to resolve.</text>
</svg>
<figcaption>The TCP call sequence. The outlined calls are the ones that block.</figcaption>
</figure>

Read down each column and the asymmetry is obvious. The client resolves a name, creates a socket, and connects. The server creates a socket, binds it to a port, announces that it's listening, and then waits.

A few things in that picture are worth pulling out.

**Only the client calls `getaddrinfo()`.** It's the one with a hostname to turn into an address, and that resolution involves DNS, which means it involves the network, which means it can block. The server already knows where it is.

**`bind()` is optional on the client.** You almost never call it. Skip it and the kernel assigns an ephemeral port when you connect — which is fine, because nobody needs to know in advance which port your outbound connection came from.

**`listen()` doesn't wait for anything.** This tripped me up for a while. `listen()` returns immediately; all it does is mark the socket as one that accepts incoming connections and set the backlog — how many pending connections the kernel will queue before it starts refusing them. The waiting happens in `accept()`.

Now the UDP version, which is mostly defined by what's missing:

```
client:  getaddrinfo   socket   bind   sendto     close
server:                socket   bind   recvfrom   close
```

No `listen()`. No `accept()`. No `connect()`.

Those three exist to establish a connection, and UDP doesn't have connections. There is no three-way handshake to perform, so there is nothing to wait for and nothing to accept. You create a socket, you throw a datagram at an address, and you're done. `sendto()` and `recvfrom()` carry the address as an argument on every single call, because without a connection there's nowhere else to keep it.

## What `accept()` actually returns

This is the detail I'd most want someone to tell me early, because it explains the shape of every TCP server you'll ever read.

<figure class="diagram">
<svg viewBox="0 0 700 356" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="In TCP accept returns a new socket per client while the listening socket keeps listening; in UDP one socket serves every client">
<defs>
<marker id="ar-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<text x="20" y="24" class="t-strong">TCP</text>
<rect x="20" y="40" width="150" height="46" rx="6" class="box-accent"/>
<text x="95" y="62" text-anchor="middle" class="t-mono t-accent">listen_fd</text>
<text x="95" y="78" text-anchor="middle" class="t-sm">never reads data</text>
<rect x="250" y="34" width="150" height="34" rx="5" class="box"/>
<text x="325" y="56" text-anchor="middle" class="t-mono">conn_fd 4</text>
<rect x="250" y="76" width="150" height="34" rx="5" class="box"/>
<text x="325" y="98" text-anchor="middle" class="t-mono">conn_fd 5</text>
<rect x="250" y="118" width="150" height="34" rx="5" class="box"/>
<text x="325" y="140" text-anchor="middle" class="t-mono">conn_fd 6</text>
<line x1="174" y1="58" x2="246" y2="51" class="arrow" marker-end="url(#ar-a)"/>
<line x1="174" y1="66" x2="246" y2="93" class="arrow" marker-end="url(#ar-a)"/>
<line x1="174" y1="74" x2="246" y2="135" class="arrow" marker-end="url(#ar-a)"/>
<text x="196" y="24" class="t-sm">accept()</text>
<rect x="440" y="34" width="110" height="34" rx="5" class="box-ghost"/>
<text x="495" y="56" text-anchor="middle" class="t-sm">client A</text>
<rect x="440" y="76" width="110" height="34" rx="5" class="box-ghost"/>
<text x="495" y="98" text-anchor="middle" class="t-sm">client B</text>
<rect x="440" y="118" width="110" height="34" rx="5" class="box-ghost"/>
<text x="495" y="140" text-anchor="middle" class="t-sm">client C</text>
<line x1="404" y1="51" x2="436" y2="51" class="arrow arrow-dash"/>
<line x1="404" y1="93" x2="436" y2="93" class="arrow arrow-dash"/>
<line x1="404" y1="135" x2="436" y2="135" class="arrow arrow-dash"/>
<text x="566" y="80" class="t-sm">one socket</text>
<text x="566" y="98" class="t-sm">per client</text>
<line x1="20" y1="184" x2="680" y2="184" class="rule"/>
<text x="20" y="214" class="t-strong">UDP</text>
<rect x="20" y="230" width="150" height="46" rx="6" class="box-accent"/>
<text x="95" y="252" text-anchor="middle" class="t-mono t-accent">sock_fd</text>
<text x="95" y="268" text-anchor="middle" class="t-sm">reads everything</text>
<rect x="440" y="212" width="110" height="34" rx="5" class="box-ghost"/>
<text x="495" y="234" text-anchor="middle" class="t-sm">client A</text>
<rect x="440" y="254" width="110" height="34" rx="5" class="box-ghost"/>
<text x="495" y="276" text-anchor="middle" class="t-sm">client B</text>
<rect x="440" y="296" width="110" height="34" rx="5" class="box-ghost"/>
<text x="495" y="318" text-anchor="middle" class="t-sm">client C</text>
<line x1="436" y1="229" x2="174" y2="246" class="arrow" marker-end="url(#ar-a)"/>
<line x1="436" y1="271" x2="174" y2="256" class="arrow" marker-end="url(#ar-a)"/>
<line x1="436" y1="313" x2="174" y2="266" class="arrow" marker-end="url(#ar-a)"/>
<text x="20" y="302" class="t-sm">recvfrom() fills in</text>
<text x="20" y="320" class="t-sm">who sent it — so you</text>
<text x="20" y="338" class="t-sm">pass an empty address</text>
</svg>
<figcaption>In TCP the listening socket only ever manufactures more sockets. In UDP there is just the one.</figcaption>
</figure>

`accept()` does not return data. It returns **a new socket**.

Your listening socket goes on listening — it never carries a single byte of application data. Each time a client connects, `accept()` hands you a fresh descriptor dedicated to that one client, and that's the one you `recv()` and `send()` on. Ten clients, ten descriptors, plus the listener.

That's why TCP servers are structured the way they are: a loop around `accept()`, and something — a thread, a process, an event loop — taking each returned descriptor away to be dealt with.

UDP has none of this. One socket receives from everybody. `recvfrom()` fills in a `sockaddr` telling you who sent this particular datagram, which is exactly why you hand it an *empty* address struct — it's an output, not an input. That asymmetry with `sendto()`, where the address is an input you fill in, is easy to get backwards.

## A socket is a file, and a port is a hash key

Two pieces of vocabulary that get used loosely, and are worth being precise about.

A socket is **a file in kernel space**. Not a file on disk — an in-memory object the kernel owns, which you refer to by descriptor. That's why `close()` works on it, why it shows up in `lsof`, why descriptor limits apply to it. It behaves like a file because as far as your process is concerned, it is one.

And a port number is not a door in the side of your machine. It's part of a key.

<figure class="diagram">
<svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An arriving packet is demultiplexed to the right socket by looking up its address tuple in a kernel hash table">
<defs>
<marker id="pd-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<rect x="20" y="70" width="160" height="70" rx="6" class="box"/>
<text x="100" y="96" text-anchor="middle" class="t-sm">a packet arrives</text>
<text x="100" y="118" text-anchor="middle" class="t-mono">:443 → :51234</text>
<line x1="184" y1="105" x2="238" y2="105" class="arrow" marker-end="url(#pd-a)"/>
<rect x="242" y="46" width="230" height="120" rx="6" class="box-accent"/>
<text x="357" y="72" text-anchor="middle" class="t-strong t-accent">kernel hash table</text>
<text x="357" y="94" text-anchor="middle" class="t-sm">keyed on the address tuple</text>
<rect x="258" y="106" width="198" height="24" rx="3" class="box fill-bg"/>
<text x="357" y="123" text-anchor="middle" class="t-mono">src ip : port → dst ip : port</text>
<text x="357" y="152" text-anchor="middle" class="t-sm">one lookup, not a scan</text>
<line x1="476" y1="105" x2="530" y2="105" class="arrow" marker-end="url(#pd-a)"/>
<rect x="534" y="70" width="146" height="70" rx="6" class="box"/>
<text x="607" y="96" text-anchor="middle" class="t-sm">the right socket</text>
<text x="607" y="118" text-anchor="middle" class="t-mono">fd 7</text>
<line x1="20" y1="204" x2="680" y2="204" class="rule"/>
<text x="20" y="234" class="t-sm t-strong">This is what a port number actually is.</text>
<text x="20" y="258" class="t-sm">Not a door in the machine — part of the key the kernel uses to decide which</text>
<text x="20" y="276" class="t-sm">open socket a packet belongs to.</text>
</svg>
<figcaption>A port number is part of the key the kernel hashes to find the socket a packet belongs to.</figcaption>
</figure>

When a packet arrives, the kernel has to work out which of your open sockets it belongs to. It does that by hashing the address tuple — source address and port, destination address and port — and looking the result up in a table. One lookup, not a scan through every socket on the system.

Once you see it that way, some things that seemed like arbitrary rules stop being arbitrary. Two sockets can share a port as long as the rest of the tuple differs, which is how one server holds thousands of simultaneous connections on port 443. "Address already in use" is a key collision.

## What blocks, and what only looks like it does

The single most useful thing to know about this API is which calls stop your program.

**These block:** `accept()`, `connect()`, `recv()`, `recvfrom()`. And `getaddrinfo()`, whenever it has to do a DNS lookup — which is easy to forget, because it doesn't look like a network call.

Every one of them is waiting on somebody else. `accept()` waits for a client. `connect()` waits for a handshake. `recv()` waits for bytes that may never come.

**`send()` and `sendto()` generally don't.** And the reason is the interesting part: when `send()` returns, your data has not been delivered. It hasn't necessarily even left the machine. All that happened is the kernel copied your bytes into its own buffer and said *fine, I've got this*.

Everything after that — waiting for acknowledgements, retransmitting what was lost, backing off when the network is congested — happens inside the kernel, on its own schedule, with no involvement from your program. You will never write retry logic for a TCP segment. That is the whole point of TCP.

`send()` only blocks when that buffer is full and the kernel has nowhere left to put your data.

There's a related trap. `send()` returns the number of bytes it accepted, and **that number can be smaller than what you handed it.** Give it a large buffer and it may take part of it and expect you to come back with the rest. Treating `send()` as though it always consumes everything is a bug that stays hidden until your messages get big.

## Waiting on many sockets at once

So `recv()` blocks. Fine for one connection. Now serve a thousand.

You can make sockets non-blocking, and then `recv()` returns immediately with "nothing yet" instead of waiting — but if your answer is to spin in a loop asking a thousand sockets whether they have anything, you've built a program that burns a whole core to do nothing. It works, and it's a bad idea.

The real answer is to ask the kernel *which* sockets are ready, and block until at least one of them is.

<figure class="diagram">
<svg viewBox="0 0 700 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="select and poll hand the kernel every descriptor on each call and cost O of n; epoll registers interest once and returns only ready descriptors">
<defs>
<marker id="mx-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="mx-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<text x="20" y="26" class="t-strong t-mono">select() / poll()</text>
<text x="180" y="26" class="t-sm">— every call, every time</text>
<rect x="20" y="44" width="230" height="86" rx="6" class="box"/>
<text x="135" y="68" text-anchor="middle" class="t-sm">your program hands over</text>
<text x="135" y="90" text-anchor="middle" class="t-mono">all 10,000 fds</text>
<text x="135" y="112" text-anchor="middle" class="t-sm">on every single call</text>
<line x1="254" y1="87" x2="316" y2="87" class="arrow" marker-end="url(#mx-a)"/>
<rect x="320" y="44" width="230" height="86" rx="6" class="box"/>
<text x="435" y="68" text-anchor="middle" class="t-sm">the kernel walks the</text>
<text x="435" y="90" text-anchor="middle" class="t-sm">whole list looking for</text>
<text x="435" y="112" text-anchor="middle" class="t-sm">the handful that are ready</text>
<text x="576" y="94" class="t-mono">O(n)</text>
<line x1="20" y1="164" x2="680" y2="164" class="rule"/>
<text x="20" y="196" class="t-strong t-mono t-accent">epoll()</text>
<text x="110" y="196" class="t-sm">— register once, then ask</text>
<rect x="20" y="214" width="230" height="86" rx="6" class="box-accent"/>
<text x="135" y="238" text-anchor="middle" class="t-sm">you register interest</text>
<text x="135" y="260" text-anchor="middle" class="t-sm">once, up front</text>
<text x="135" y="284" text-anchor="middle" class="t-sm">the kernel keeps the set</text>
<line x1="254" y1="257" x2="316" y2="257" class="arrow arrow-accent" marker-end="url(#mx-b)"/>
<rect x="320" y="214" width="230" height="86" rx="6" class="box-accent"/>
<text x="435" y="238" text-anchor="middle" class="t-sm">it hands back only the</text>
<text x="435" y="260" text-anchor="middle" class="t-sm">descriptors that are</text>
<text x="435" y="284" text-anchor="middle" class="t-sm">actually ready</text>
<text x="576" y="264" class="t-mono t-accent">O(1)</text>
</svg>
<figcaption>select and poll re-send the whole list on every call. epoll registers it once.</figcaption>
</figure>

`select()` and `poll()` do this, and they share the same flaw: you hand over the entire set of descriptors on every single call, and the kernel walks the whole thing looking for the few that are ready. Ten thousand connections, ten of them ready, and you've paid for ten thousand — every time round the loop.

`epoll()` fixes it by splitting registration from waiting. You tell the kernel once which descriptors you care about, it keeps that set, and when you ask, it hands back only the ones that are ready. The cost stops scaling with how many connections you're holding and starts scaling with how many are actually active — which, for most servers, is a small fraction.

That distinction is why event-driven servers can hold connections that would flatten a thread-per-connection design.

## Bytes on the wire

Two last things, both consequences of the fact that a network moves bytes and nothing else.

**Don't send raw structs.** Pointing at a struct and writing `sizeof` bytes down a socket feels efficient and breaks the moment the other end has different padding, a different integer width, or a different byte order. It usually survives testing, because you test against the same machine you built on.

The options are text — print into something ASCII or UTF-8, which is readable, debuggable, and larger — or a defined binary encoding, where you specify every field's width and order yourself. Text for almost everything; binary when bandwidth or latency genuinely matter and you're prepared to maintain a spec.

**Broadcast is UDP-only.** You can send to `255.255.255.255` to reach everything on the local network, or to a particular subnet's broadcast address to reach that subnet, and every host there receives it. TCP cannot do this — a connection is between two endpoints by definition, and there is nobody to handshake with.

It's also IPv4-only. IPv6 dropped broadcast entirely in favour of multicast, where receivers opt into a group rather than everyone being interrupted by default. Which is the better design, and does mean the broadcast trick you learned on IPv4 has no direct equivalent.

## Sources

- [Core Dumped](https://www.youtube.com/@CoreDumpped) — the channel these notes came from
- [Beej's Guide to Network Programming](https://beej.us/guide/bgnet/) — the standard free reference for this API
- man pages: [socket(2)](https://man7.org/linux/man-pages/man2/socket.2.html) · [bind(2)](https://man7.org/linux/man-pages/man2/bind.2.html) · [listen(2)](https://man7.org/linux/man-pages/man2/listen.2.html) · [accept(2)](https://man7.org/linux/man-pages/man2/accept.2.html) · [send(2)](https://man7.org/linux/man-pages/man2/send.2.html) · [recv(2)](https://man7.org/linux/man-pages/man2/recv.2.html)
- [getaddrinfo(3)](https://man7.org/linux/man-pages/man3/getaddrinfo.3.html) · [epoll(7)](https://man7.org/linux/man-pages/man7/epoll.7.html) · [select(2)](https://man7.org/linux/man-pages/man2/select.2.html)

Diagrams are my own.

