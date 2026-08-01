---
title: Nobody in Kubernetes talks to anybody else
description: >-
  One kubectl apply, traced from your terminal to a running container — and the
  single idea that makes the architecture diagram stop being a tangle of arrows.
date: '2026-08-01'
category: platform-eng
tags: []
draft: false
source: platform-eng/Nobody in Kubernetes talks to anybody else.md
updated: '2026-08-01'
---

Every explanation of Kubernetes architecture opens with the same picture. Ten boxes. Control plane on the left, worker nodes on the right, arrows in between. I stared at that diagram for a long time before any of it stuck, and I've come to think the diagram is part of the problem.

<figure class="diagram">
<svg viewBox="0 0 700 430" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Five Kubernetes components each connected only to the API server, which alone connects to etcd">
<defs>
<marker id="wh-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="wh-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<rect x="268" y="176" width="164" height="66" rx="6" class="box-accent"/>
<text x="350" y="202" text-anchor="middle" class="t-strong t-accent">API server</text>
<text x="350" y="222" text-anchor="middle" class="t-sm">the only door</text>
<rect x="552" y="184" width="120" height="52" rx="6" class="box"/>
<text x="612" y="215" text-anchor="middle">etcd</text>
<line x1="438" y1="210" x2="546" y2="210" class="arrow arrow-accent" marker-end="url(#wh-b)" marker-start="url(#wh-b)"/>
<text x="492" y="198" text-anchor="middle" class="t-sm">reads and writes</text>
<rect x="28" y="34" width="140" height="46" rx="6" class="box"/>
<text x="98" y="62" text-anchor="middle">kubectl</text>
<rect x="280" y="34" width="200" height="46" rx="6" class="box"/>
<text x="380" y="62" text-anchor="middle">controller manager</text>
<rect x="546" y="34" width="126" height="46" rx="6" class="box"/>
<text x="609" y="62" text-anchor="middle">scheduler</text>
<rect x="28" y="330" width="212" height="46" rx="6" class="box"/>
<text x="134" y="358" text-anchor="middle">cloud controller mgr</text>
<rect x="300" y="330" width="160" height="46" rx="6" class="box"/>
<text x="380" y="358" text-anchor="middle">kubelet</text>
<line x1="120" y1="84" x2="288" y2="172" class="arrow arrow-dash" marker-end="url(#wh-a)"/>
<line x1="368" y1="84" x2="352" y2="172" class="arrow arrow-dash" marker-end="url(#wh-a)"/>
<line x1="582" y1="84" x2="416" y2="172" class="arrow arrow-dash" marker-end="url(#wh-a)"/>
<line x1="160" y1="326" x2="288" y2="246" class="arrow arrow-dash" marker-end="url(#wh-a)"/>
<line x1="374" y1="326" x2="358" y2="246" class="arrow arrow-dash" marker-end="url(#wh-a)"/>
<rect x="28" y="180" width="176" height="58" rx="6" class="box-ghost"/>
<line x1="44" y1="200" x2="76" y2="200" class="arrow arrow-dash"/>
<text x="86" y="204" class="t-sm">a watch connection</text>
<line x1="44" y1="222" x2="76" y2="222" class="arrow arrow-accent"/>
<text x="86" y="226" class="t-sm">the only etcd traffic</text>
<text x="350" y="410" text-anchor="middle" class="t-sm">Not one dashed line connects two components to each other.</text>
</svg>
<figcaption>Every component watches the API server. Only the API server touches etcd.</figcaption>
</figure>

The trouble is the arrows. They look like calls. They suggest the scheduler picks up the phone to the kubelet, that the controller manager tells the scheduler there's work to do, that there's some orderly chain of command running down the page.

There isn't. Almost nothing in Kubernetes talks to anything else.

With one exception, every component in that diagram talks to exactly one other component — the API server — and it does so by opening a long-lived HTTP connection and then waiting to be told that something it cares about has changed. The scheduler never calls the kubelet. The deployment controller never calls the scheduler. They don't know each other exists.

Once that lands, the diagram stops being a network and becomes something much simpler: a list of loops, all pointed at the same place.

The best way I know to show this is to follow one `kubectl apply` all the way from your terminal to a running container, and introduce each component at the moment it actually does something.

## The write

You run `kubectl apply -f deployment.yaml`. The first thing that happens is an HTTP request to the API server, and the first thing the API server does is decide whether it's going to listen to you at all.

<figure class="diagram">
<svg viewBox="0 0 700 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="kubectl apply passes through authentication, authorisation and versioning inside the API server before reaching etcd">
<defs>
<marker id="wp-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<rect x="10" y="96" width="128" height="52" rx="6" class="box"/>
<text x="74" y="120" text-anchor="middle" class="t-mono">kubectl apply</text>
<text x="74" y="138" text-anchor="middle" class="t-sm">your terminal</text>
<rect x="180" y="46" width="360" height="152" rx="8" class="box-accent"/>
<text x="360" y="70" text-anchor="middle" class="t-strong t-accent">API server</text>
<rect x="200" y="88" width="100" height="46" rx="5" class="box fill-bg"/>
<text x="250" y="110" text-anchor="middle" class="t-sm">authenticate</text>
<text x="250" y="126" text-anchor="middle" class="t-sm">certificates</text>
<rect x="310" y="88" width="100" height="46" rx="5" class="box fill-bg"/>
<text x="360" y="110" text-anchor="middle" class="t-sm">authorise</text>
<text x="360" y="126" text-anchor="middle" class="t-sm">RBAC</text>
<rect x="420" y="88" width="100" height="46" rx="5" class="box fill-bg"/>
<text x="470" y="110" text-anchor="middle" class="t-sm">validate</text>
<text x="470" y="126" text-anchor="middle" class="t-sm">+ version</text>
<line x1="300" y1="111" x2="308" y2="111" class="arrow" marker-end="url(#wp-a)"/>
<line x1="410" y1="111" x2="418" y2="111" class="arrow" marker-end="url(#wp-a)"/>
<text x="360" y="172" text-anchor="middle" class="t-sm">any one of these can reject the request</text>
<rect x="580" y="96" width="110" height="52" rx="6" class="box"/>
<text x="635" y="127" text-anchor="middle">etcd</text>
<line x1="142" y1="122" x2="174" y2="122" class="arrow" marker-end="url(#wp-a)"/>
<line x1="544" y1="122" x2="574" y2="122" class="arrow" marker-end="url(#wp-a)"/>
<text x="360" y="228" text-anchor="middle" class="t-sm">Nothing is running yet. All that exists is a record of intent.</text>
</svg>
<figcaption>Authentication, authorisation, validation — then, and only then, a write to etcd.</figcaption>
</figure>

Authentication comes first, and inside a cluster it's almost always certificates — each component gets a client cert, and the API server checks it. Then authorisation, which is RBAC: Roles that describe what may be done, RoleBindings that attach them to a subject. Only after both of those does the API server look at what you actually sent.

There's also versioning to get through — `v1`, `v1beta1`, and so on — because the API server has to accept objects written against older versions of the schema and store them in whatever the current internal representation is. This is unglamorous and it's most of what an API server does.

And then it writes to etcd.

That last sentence is worth slowing down on, because it's the load-bearing fact of the whole architecture: **the API server is the only component that talks to etcd.** Not the scheduler. Not the controller manager. Not the kubelet. If some component needs to know the state of the world, it asks the API server, and the API server asks etcd.

You could imagine a design where every component read from the datastore directly. It would even be faster. But then every component would need etcd credentials, would need to understand etcd's data layout, and would be able to write whatever it liked. Funnelling everything through one process means authentication, authorisation, validation, and versioning happen in exactly one place. The cost is a bottleneck. The benefit is that there is one door.

## etcd, briefly

<figure class="diagram">
<svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An etcd cluster with one leader and two followers, a write committed once a quorum acknowledges, and revisions accumulating until compaction">
<defs>
<marker id="et-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<rect x="14" y="20" width="366" height="176" rx="8" class="box-ghost"/>
<text x="30" y="42" class="t-sm">etcd cluster — odd number of members, so a majority always exists</text>
<rect x="40" y="60" width="120" height="48" rx="6" class="box-accent"/>
<text x="100" y="82" text-anchor="middle" class="t-strong t-accent">leader</text>
<text x="100" y="99" text-anchor="middle" class="t-sm">all writes</text>
<rect x="230" y="56" width="120" height="42" rx="6" class="box"/>
<text x="290" y="82" text-anchor="middle" class="t-sm">follower</text>
<rect x="230" y="118" width="120" height="42" rx="6" class="box"/>
<text x="290" y="144" text-anchor="middle" class="t-sm">follower</text>
<line x1="164" y1="76" x2="226" y2="76" class="arrow" marker-end="url(#et-a)"/>
<line x1="164" y1="98" x2="226" y2="136" class="arrow" marker-end="url(#et-a)"/>
<text x="196" y="172" text-anchor="middle" class="t-sm">committed once a</text>
<text x="196" y="188" text-anchor="middle" class="t-sm">majority acknowledges</text>
<line x1="410" y1="30" x2="410" y2="270" class="rule"/>
<text x="440" y="46" class="t-sm t-strong">Every write adds a revision</text>
<rect x="440" y="62" width="52" height="26" rx="4" class="box"/>
<text x="466" y="79" text-anchor="middle" class="t-mono">rev 1</text>
<rect x="502" y="62" width="52" height="26" rx="4" class="box"/>
<text x="528" y="79" text-anchor="middle" class="t-mono">rev 2</text>
<rect x="564" y="62" width="52" height="26" rx="4" class="box"/>
<text x="590" y="79" text-anchor="middle" class="t-mono">rev 3</text>
<rect x="626" y="62" width="52" height="26" rx="4" class="box-accent"/>
<text x="652" y="79" text-anchor="middle" class="t-mono t-accent">now</text>
<text x="440" y="112" class="t-sm">Old values are kept, not overwritten.</text>
<text x="440" y="130" class="t-sm">That is what makes the watch API possible.</text>
<line x1="440" y1="152" x2="678" y2="152" class="rule"/>
<text x="440" y="178" class="t-sm t-strong">and so history grows forever</text>
<rect x="440" y="192" width="110" height="40" rx="5" class="box"/>
<text x="495" y="209" text-anchor="middle" class="t-sm">compaction</text>
<text x="495" y="225" text-anchor="middle" class="t-sm">drops revisions</text>
<rect x="568" y="192" width="110" height="40" rx="5" class="box"/>
<text x="623" y="209" text-anchor="middle" class="t-sm">defragmentation</text>
<text x="623" y="225" text-anchor="middle" class="t-sm">reclaims the file</text>
<line x1="554" y1="212" x2="564" y2="212" class="arrow" marker-end="url(#et-a)"/>
<text x="440" y="256" class="t-sm">One frees revisions, the other</text>
<text x="440" y="274" class="t-sm">frees the space they left behind.</text>
</svg>
<figcaption>A write is committed once a majority acknowledges it. Old revisions pile up until something removes them.</figcaption>
</figure>

etcd is a strongly consistent distributed key-value store, and it uses Raft to stay that way. One node is the leader and all writes go through it; the write isn't committed until a quorum of nodes has acknowledged it. That quorum requirement is where the cluster's fault tolerance comes from, and it's also why etcd cluster sizes are always odd numbers.

Underneath, etcd stores data in bbolt. Above that, it's multi-version — an update doesn't overwrite the old value, it writes a new revision alongside it. That's what makes the watch API possible, which we'll get to shortly, and it's genuinely useful: you can ask what the state was at revision *n*.

It also means etcd accumulates history forever unless something removes it, which is why compaction exists, and why defragmentation exists after that. Compaction drops old revisions; defragmentation reclaims the space they left behind in the file. My notes describe this as a frequent operational need, and I'll leave it there rather than pretend to more operational scar tissue than I have.

So: your Deployment object is now durably stored, and the API server returns a `201` to `kubectl`. From your terminal's point of view, the job is done.

Nothing is running yet. No container has been pulled. No node has been chosen. All that exists is a record of intent.

## The watch

Here's the mechanism everything else hangs off.

A component that cares about some kind of object — Deployments, say, or Pods — opens a long-lived HTTP connection to the API server and says, in effect, *tell me when one of these changes*. The API server holds the connection open and streams events down it: ADDED, MODIFIED, DELETED. No polling. No component asking another component whether there's work.

This is the watch API, and once you know it's there, the architecture diagram's arrows all resolve into the same shape. Every box is a program in a loop: watch for events, compare what the cluster looks like to what it's supposed to look like, do something about the difference, repeat.

That pattern has a name — the reconciliation loop — and it's the reason Kubernetes recovers from things. A controller isn't executing a plan that could get interrupted halfway. It's continuously asking *is reality what it should be?* and acting when the answer is no. Kill a controller mid-operation and restart it, and it picks up from whatever state it finds.

## The controllers

<figure class="diagram">
<svg viewBox="0 0 700 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A controller loop: watch for events, compare desired against actual, act on the difference, write back through the API server">
<defs>
<marker id="wl-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="wl-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<rect x="14" y="40" width="150" height="200" rx="8" class="box-accent"/>
<text x="89" y="66" text-anchor="middle" class="t-strong t-accent">API server</text>
<text x="89" y="100" text-anchor="middle" class="t-sm">holds a long-lived</text>
<text x="89" y="116" text-anchor="middle" class="t-sm">connection open</text>
<rect x="30" y="136" width="118" height="26" rx="4" class="box fill-bg"/>
<text x="89" y="153" text-anchor="middle" class="t-mono">ADDED</text>
<rect x="30" y="168" width="118" height="26" rx="4" class="box fill-bg"/>
<text x="89" y="185" text-anchor="middle" class="t-mono">MODIFIED</text>
<rect x="30" y="200" width="118" height="26" rx="4" class="box fill-bg"/>
<text x="89" y="217" text-anchor="middle" class="t-mono">DELETED</text>
<rect x="250" y="30" width="420" height="222" rx="8" class="box-ghost"/>
<text x="460" y="54" text-anchor="middle" class="t-sm t-strong">one controller, looping forever</text>
<rect x="286" y="74" width="150" height="44" rx="6" class="box"/>
<text x="361" y="101" text-anchor="middle" class="t-sm">1. observe an event</text>
<rect x="486" y="74" width="150" height="44" rx="6" class="box"/>
<text x="561" y="94" text-anchor="middle" class="t-sm">2. compare desired</text>
<text x="561" y="110" text-anchor="middle" class="t-sm">against actual</text>
<rect x="486" y="164" width="150" height="44" rx="6" class="box"/>
<text x="561" y="184" text-anchor="middle" class="t-sm">3. act on the</text>
<text x="561" y="200" text-anchor="middle" class="t-sm">difference</text>
<rect x="286" y="164" width="150" height="44" rx="6" class="box"/>
<text x="361" y="184" text-anchor="middle" class="t-sm">4. write the result</text>
<text x="361" y="200" text-anchor="middle" class="t-sm">back</text>
<line x1="440" y1="96" x2="482" y2="96" class="arrow" marker-end="url(#wl-a)"/>
<line x1="561" y1="122" x2="561" y2="160" class="arrow" marker-end="url(#wl-a)"/>
<line x1="482" y1="186" x2="440" y2="186" class="arrow" marker-end="url(#wl-a)"/>
<line x1="361" y1="160" x2="361" y2="122" class="arrow arrow-dash" marker-end="url(#wl-a)"/>
<line x1="168" y1="120" x2="282" y2="92" class="arrow arrow-dash" marker-end="url(#wl-a)"/>
<line x1="282" y1="192" x2="168" y2="170" class="arrow arrow-accent" marker-end="url(#wl-b)"/>
<text x="360" y="288" text-anchor="middle" class="t-sm">It is not executing a plan that could be interrupted halfway.</text>
<text x="360" y="306" text-anchor="middle" class="t-sm">Kill it mid-operation and it resumes from whatever it finds.</text>
</svg>
<figcaption>Every controller is this same loop, pointed at a different kind of object.</figcaption>
</figure>

The controller manager is one process. Inside it, one goroutine per controller — Deployment, Job, CronJob, and a long list of others — each with its own watch on the API server, each reconciling its own kind of object.

The Deployment controller sees the ADDED event for the object you just created. It compares what exists against what your spec asked for, finds no pods, and creates them — through the API server, of course, which writes them to etcd, which produces more events, which other controllers are watching for.

Notice what didn't happen: the Deployment controller did not choose a node. The pods it created have no node assigned to them at all. They exist as records with an empty `nodeName` field. As far as the cluster is concerned they're wishes, not workloads.

That's deliberate. Deciding *what should exist* and deciding *where it should go* are different problems, and Kubernetes keeps them in different processes.

## The scheduler

<figure class="diagram">
<svg viewBox="0 0 700 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The scheduler filters all nodes down to feasible ones, scores those, and writes the winning node name into the pod">
<defs>
<marker id="fs-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="fs-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<text x="86" y="34" text-anchor="middle" class="t-sm t-strong">every node</text>
<rect x="20" y="48" width="132" height="130" rx="6" class="box"/>
<circle cx="48" cy="76" r="9" class="box"/><circle cx="86" cy="76" r="9" class="box"/><circle cx="124" cy="76" r="9" class="box"/>
<circle cx="48" cy="113" r="9" class="box"/><circle cx="86" cy="113" r="9" class="box"/><circle cx="124" cy="113" r="9" class="box"/>
<circle cx="48" cy="150" r="9" class="box"/><circle cx="86" cy="150" r="9" class="box"/><circle cx="124" cy="150" r="9" class="box"/>
<line x1="158" y1="113" x2="212" y2="113" class="arrow" marker-end="url(#fs-a)"/>
<text x="185" y="102" text-anchor="middle" class="t-sm">filter</text>
<rect x="216" y="48" width="150" height="130" rx="6" class="box-ghost"/>
<text x="291" y="72" text-anchor="middle" class="t-sm">can this node run it</text>
<text x="291" y="88" text-anchor="middle" class="t-sm">at all?</text>
<text x="232" y="112" class="t-sm">enough cpu / memory</text>
<text x="232" y="130" class="t-sm">tolerates the taints</text>
<text x="232" y="148" class="t-sm">matches the selectors</text>
<text x="232" y="166" class="t-sm">volumes available</text>
<line x1="372" y1="113" x2="416" y2="113" class="arrow" marker-end="url(#fs-a)"/>
<text x="394" y="102" text-anchor="middle" class="t-sm">score</text>
<text x="470" y="34" text-anchor="middle" class="t-sm t-strong">feasible nodes, ranked</text>
<rect x="420" y="48" width="120" height="130" rx="6" class="box"/>
<circle cx="450" cy="76" r="9" class="box"/><text x="470" y="81" class="t-mono">92</text>
<circle cx="450" cy="106" r="9" class="box"/><text x="470" y="111" class="t-mono">88</text>
<circle cx="450" cy="136" r="9" class="box"/><text x="470" y="141" class="t-mono">61</text>
<circle cx="450" cy="163" r="9" class="box"/><text x="470" y="168" class="t-mono">40</text>
<line x1="546" y1="76" x2="588" y2="76" class="arrow arrow-accent" marker-end="url(#fs-b)"/>
<rect x="592" y="54" width="94" height="44" rx="6" class="box-accent"/>
<text x="639" y="81" text-anchor="middle" class="t-accent t-strong">winner</text>
<rect x="420" y="216" width="266" height="52" rx="6" class="box"/>
<text x="553" y="238" text-anchor="middle" class="t-sm">the scheduler's entire output</text>
<text x="553" y="257" text-anchor="middle" class="t-mono">nodeName: node-07</text>
<line x1="639" y1="102" x2="639" y2="212" class="arrow arrow-accent" marker-end="url(#fs-b)"/>
<text x="20" y="238" class="t-sm">Filtering answers "could it".</text>
<text x="20" y="258" class="t-sm">Scoring answers "should it" —</text>
<text x="20" y="278" class="t-sm">which is a policy question,</text>
<text x="20" y="298" class="t-sm">not a technical one.</text>
</svg>
<figcaption>Filtering answers whether a node could run the pod. Scoring answers whether it should.</figcaption>
</figure>

The scheduler is watching for exactly one thing: pods with no node assigned.

When it finds one, it has to answer a question that sounds simple and isn't — which node should this run on?

The answer comes in two stages. First, filtering: eliminate every node that *can't* run this pod. Not enough CPU or memory, taints the pod doesn't tolerate, node selectors that don't match, and so on. What survives is the set of feasible nodes. Then, scoring: rank the survivors and take the best one.

The scoring stage is where it gets opinionated, because "best" is a policy question rather than a technical one.

<figure class="diagram">
<svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Least Allocated spreads pods across all nodes; Most Allocated packs them onto fewer nodes and leaves others empty">
<text x="20" y="28" class="t-strong">Least Allocated <tspan class="t-sm">— the default</tspan></text>
<rect x="20" y="44" width="120" height="76" rx="6" class="box"/>
<rect x="30" y="94" width="100" height="18" rx="3" class="box-accent"/>
<rect x="30" y="72" width="100" height="18" rx="3" class="box-accent"/>
<rect x="164" y="44" width="120" height="76" rx="6" class="box"/>
<rect x="174" y="94" width="100" height="18" rx="3" class="box-accent"/>
<rect x="174" y="72" width="100" height="18" rx="3" class="box-accent"/>
<rect x="308" y="44" width="120" height="76" rx="6" class="box"/>
<rect x="318" y="94" width="100" height="18" rx="3" class="box-accent"/>
<rect x="318" y="72" width="100" height="18" rx="3" class="box-accent"/>
<rect x="452" y="44" width="120" height="76" rx="6" class="box"/>
<rect x="462" y="94" width="100" height="18" rx="3" class="box-accent"/>
<text x="596" y="72" class="t-sm">room to grow,</text>
<text x="596" y="90" class="t-sm">smaller blast</text>
<text x="596" y="108" class="t-sm">radius per node</text>
<line x1="20" y1="146" x2="680" y2="146" class="rule"/>
<text x="20" y="180" class="t-strong">Most Allocated <tspan class="t-sm">— bin packing</tspan></text>
<rect x="20" y="196" width="120" height="76" rx="6" class="box"/>
<rect x="30" y="246" width="100" height="18" rx="3" class="box-accent"/>
<rect x="30" y="224" width="100" height="18" rx="3" class="box-accent"/>
<rect x="30" y="202" width="100" height="18" rx="3" class="box-accent"/>
<rect x="164" y="196" width="120" height="76" rx="6" class="box"/>
<rect x="174" y="246" width="100" height="18" rx="3" class="box-accent"/>
<rect x="174" y="224" width="100" height="18" rx="3" class="box-accent"/>
<rect x="174" y="202" width="100" height="18" rx="3" class="box-accent"/>
<rect x="308" y="196" width="120" height="76" rx="6" class="box"/>
<rect x="318" y="246" width="100" height="18" rx="3" class="box-accent"/>
<rect x="452" y="196" width="120" height="76" rx="6" class="box-ghost"/>
<text x="512" y="240" text-anchor="middle" class="t-sm">empty</text>
<text x="596" y="224" class="t-sm">an empty node</text>
<text x="596" y="242" class="t-sm">can be switched</text>
<text x="596" y="260" class="t-sm">off, and stop</text>
<text x="596" y="278" class="t-sm">costing money</text>
</svg>
<figcaption>Spread out, or pack tight and switch the empties off. Least Allocated is the default.</figcaption>
</figure>

The default is **Least Allocated** — prefer the node with the most free resources. Spread things out. It's a sensible default because it gives every pod room to grow and limits the blast radius when a node dies.

The alternatives lean the other way. **Most Allocated** prefers the node that's already busiest, which packs workloads tightly onto fewer nodes and leaves others empty — bin packing, and exactly what you want if a cluster autoscaler is going to turn those empty nodes off and stop charging you for them. **Requested to Capacity Ratio** is the more nuanced version: it looks at the ratio of requested to available resources across several dimensions rather than treating CPU and memory as one number.

Whichever wins, the scheduler's output is anticlimactic. It doesn't launch anything. It writes the node's name into the pod object — through the API server, which writes to etcd, which emits another event.

The scheduler's entire job is to fill in one field.

## The kubelet

<figure class="diagram">
<svg viewBox="0 0 700 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The kubelet builds the world around a container: CRI for the runtime, CNI for networking, volume mounts, secrets, then supervises with probes and metrics">
<defs>
<marker id="kl-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<rect x="14" y="20" width="672" height="326" rx="8" class="box-ghost"/>
<text x="34" y="44" class="t-sm">one worker node</text>
<rect x="34" y="60" width="160" height="60" rx="6" class="box-accent"/>
<text x="114" y="86" text-anchor="middle" class="t-strong t-accent">kubelet</text>
<text x="114" y="104" text-anchor="middle" class="t-sm">watching for pods</text>
<text x="114" y="140" text-anchor="middle" class="t-sm">bound to this node</text>
<text x="250" y="52" class="t-sm t-strong">before the container can start</text>
<rect x="250" y="66" width="196" height="40" rx="5" class="box"/>
<text x="264" y="91" class="t-sm">CRI — pull and run it</text>
<rect x="250" y="114" width="196" height="40" rx="5" class="box"/>
<text x="264" y="132" class="t-sm">CNI — pod IP, netns,</text>
<text x="264" y="148" class="t-sm">interface</text>
<rect x="250" y="162" width="196" height="40" rx="5" class="box"/>
<text x="264" y="187" class="t-sm">mount volumes</text>
<rect x="250" y="210" width="196" height="40" rx="5" class="box"/>
<text x="264" y="228" class="t-sm">secrets and configmaps,</text>
<text x="264" y="244" class="t-sm">kept in sync</text>
<rect x="250" y="258" width="196" height="40" rx="5" class="box"/>
<text x="264" y="276" class="t-sm">write resolv.conf —</text>
<text x="264" y="292" class="t-sm">DNS and search domains</text>
<line x1="198" y1="96" x2="244" y2="86" class="arrow" marker-end="url(#kl-a)"/>
<line x1="198" y1="104" x2="244" y2="180" class="arrow arrow-dash" marker-end="url(#kl-a)"/>
<rect x="490" y="66" width="180" height="76" rx="6" class="box"/>
<text x="580" y="94" text-anchor="middle">container</text>
<text x="580" y="116" text-anchor="middle" class="t-sm">finally running</text>
<line x1="450" y1="86" x2="484" y2="96" class="arrow" marker-end="url(#kl-a)"/>
<text x="490" y="176" class="t-sm t-strong">then supervision, forever</text>
<rect x="490" y="192" width="180" height="36" rx="5" class="box"/>
<text x="504" y="215" class="t-sm">liveness — restart it?</text>
<rect x="490" y="236" width="180" height="36" rx="5" class="box"/>
<text x="504" y="259" class="t-sm">readiness — send traffic?</text>
<rect x="490" y="280" width="180" height="46" rx="5" class="box"/>
<text x="504" y="298" class="t-sm">node metrics from the OS,</text>
<text x="504" y="314" class="t-sm">container metrics via cAdvisor</text>
<line x1="676" y1="146" x2="676" y2="186" class="arrow arrow-dash" marker-end="url(#kl-a)"/>
</svg>
<figcaption>The kubelet builds everything around the container before it starts, then never stops watching it.</figcaption>
</figure>

On every node there's a kubelet, watching the API server for pods assigned to *its* node. Your pod's `nodeName` just changed to match. The kubelet's watch fires.

This is the first component in the whole sequence that touches anything real.

It doesn't run containers itself. It talks to a container runtime over the Container Runtime Interface, and that indirection is the point — it's what let the ecosystem move off Docker to containerd and CRI-O without rewriting the kubelet.

Before the container can run, though, the kubelet has to build the world around it. It calls out to the CNI plugin to allocate a pod IP, create the network namespace, and configure the interface. It writes the cluster DNS server address into the pod's `/etc/resolv.conf`, along with the search domains that make `my-service` resolve without anyone typing the full name. It mounts volumes. It pulls any Secrets and ConfigMaps the pod references — again by watching the API server — and mounts those too, and keeps watching, so that when a ConfigMap changes the mounted copy updates.

Then the container starts, and the kubelet's job shifts from creation to supervision. Liveness probes: is this still working, and should I restart it? Readiness probes: should this receive traffic yet? It reports node health and status back to the control plane continuously, which is how the cluster notices a node has died.

It also reports metrics, and the split there is worth knowing. Node-level numbers come straight from the operating system. Container-level numbers come from cAdvisor, which runs *inside* the kubelet rather than as a separate thing. The metrics server that `kubectl top` talks to is an add-on that queries every kubelet in turn.

One more piece of kubelet trivia that turns out to matter: **static pods**. These are pods the kubelet runs from a local file, with no involvement from the API server at all. Which raises an obvious chicken-and-egg question — how does the API server itself get started, when starting things requires an API server? Static pods are the answer. The control plane is bootstrapped by kubelets reading manifests off local disk.

## Reaching it

Your container is running and has an IP. That IP is useless to anyone, because it's ephemeral and nobody knows it.

Two things fix that.

<figure class="diagram">
<svg viewBox="0 0 700 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="CoreDNS resolves a service name to a service IP, kube-proxy rewrites that to a pod IP at random, and an ingress controller bypasses kube-proxy entirely">
<defs>
<marker id="sr-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="sr-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<rect x="14" y="46" width="120" height="46" rx="6" class="box"/>
<text x="74" y="74" text-anchor="middle" class="t-sm">a pod, calling</text>
<rect x="14" y="100" width="120" height="26" rx="4" class="box fill-bg"/>
<text x="74" y="118" text-anchor="middle" class="t-mono">payments</text>
<line x1="138" y1="70" x2="192" y2="70" class="arrow" marker-end="url(#sr-a)"/>
<rect x="196" y="46" width="150" height="46" rx="6" class="box"/>
<text x="271" y="74" text-anchor="middle">CoreDNS</text>
<text x="196" y="112" class="t-sm">name → service IP</text>
<text x="196" y="130" class="t-sm">forwards google.com upstream</text>
<line x1="350" y1="70" x2="404" y2="70" class="arrow" marker-end="url(#sr-a)"/>
<rect x="408" y="46" width="150" height="46" rx="6" class="box"/>
<text x="483" y="74" text-anchor="middle">kube-proxy</text>
<text x="408" y="112" class="t-sm">service IP → pod IP</text>
<text x="408" y="130" class="t-sm">iptables, chosen at random</text>
<line x1="562" y1="70" x2="612" y2="70" class="arrow" marker-end="url(#sr-a)"/>
<rect x="616" y="46" width="70" height="46" rx="6" class="box-accent"/>
<text x="651" y="74" text-anchor="middle" class="t-sm t-accent">pod</text>
<line x1="14" y1="168" x2="686" y2="168" class="rule"/>
<text x="14" y="198" class="t-sm t-strong">two ways around it</text>
<rect x="14" y="212" width="320" height="96" rx="6" class="box-ghost"/>
<text x="30" y="236" class="t-sm t-strong">headless service</text>
<text x="30" y="256" class="t-mono">clusterIP: None</text>
<text x="30" y="278" class="t-sm">CoreDNS returns pod IPs directly.</text>
<text x="30" y="296" class="t-sm">Stateful workloads need a specific member.</text>
<rect x="366" y="212" width="320" height="96" rx="6" class="box-ghost"/>
<text x="382" y="236" class="t-sm t-strong">ingress controller or gateway</text>
<text x="382" y="258" class="t-sm">Skips kube-proxy and hits pod IPs itself.</text>
<text x="382" y="278" class="t-sm">Stickiness, retries and traffic splitting</text>
<text x="382" y="296" class="t-sm">live here. iptables cannot express them.</text>
<line x1="651" y1="206" x2="651" y2="98" class="arrow arrow-accent arrow-dash" marker-end="url(#sr-b)"/>
</svg>
<figcaption>A name becomes a service IP, a service IP becomes a pod IP — and two common setups skip the second step entirely.</figcaption>
</figure>

**CoreDNS** answers names. It resolves `*.svc.cluster.local` to Service IPs, which is what lets one pod address another by name instead of by address. It does some basic load balancing of its own. And it forwards anything it isn't authoritative for — `google.com` — to an upstream resolver.

There's a special case worth knowing: if a Service is declared headless, with `clusterIP: None`, CoreDNS skips the Service IP entirely and hands back pod IPs directly. Stateful workloads need this, because "any one of these replicas" is exactly the wrong answer when you're trying to reach a specific database member.

**kube-proxy** turns a Service IP into a pod IP. It runs on every node and programs iptables rules so that traffic to a Service IP gets rewritten to one of the backing pods. It works at L4, and its load balancing is *random* — there's no round robin, no least-connections, no awareness of how loaded anything is.

Which is a real limitation, and the ecosystem has largely routed around it. Ingress controllers like NGINX, and gateways like Envoy, skip kube-proxy altogether and send traffic straight to pod IPs. That's how you get session stickiness, retries, circuit breaking, and traffic splitting — none of which iptables can express.

## The one that talks to something else

I said there was an exception to everything-only-talks-to-the-API-server, and this is it.

<figure class="diagram">
<svg viewBox="0 0 700 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The cloud controller manager is the one component that talks to the cloud provider; storage provisioning sits outside it in CSI drivers">
<defs>
<marker id="cc-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="cc-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<rect x="14" y="52" width="150" height="46" rx="6" class="box-accent"/>
<text x="89" y="80" text-anchor="middle" class="t-strong t-accent">API server</text>
<rect x="220" y="20" width="230" height="150" rx="8" class="box"/>
<text x="335" y="46" text-anchor="middle" class="t-strong">cloud controller manager</text>
<rect x="238" y="60" width="194" height="32" rx="4" class="box fill-bg"/>
<text x="250" y="81" class="t-sm">node controller — labels VMs</text>
<rect x="238" y="98" width="194" height="32" rx="4" class="box fill-bg"/>
<text x="250" y="119" class="t-sm">service controller — makes LBs</text>
<rect x="238" y="136" width="194" height="26" rx="4" class="box-ghost"/>
<text x="250" y="154" class="t-sm">route controller — deprecated</text>
<line x1="168" y1="76" x2="214" y2="76" class="arrow arrow-dash" marker-end="url(#cc-a)"/>
<text x="191" y="66" text-anchor="middle" class="t-sm">watch</text>
<rect x="510" y="52" width="176" height="86" rx="8" class="box"/>
<text x="598" y="82" text-anchor="middle">your cloud</text>
<text x="598" y="104" text-anchor="middle" class="t-sm">EC2, ELB, IAM</text>
<line x1="456" y1="94" x2="504" y2="94" class="arrow arrow-accent" marker-end="url(#cc-b)"/>
<text x="598" y="158" text-anchor="middle" class="t-sm t-accent">the one outward call</text>
<line x1="14" y1="196" x2="686" y2="196" class="rule"/>
<text x="14" y="222" class="t-sm t-strong">and the thing that is conspicuously not here</text>
<rect x="14" y="234" width="150" height="34" rx="5" class="box"/>
<text x="89" y="256" text-anchor="middle" class="t-mono">PersistentVolumeClaim</text>
<line x1="168" y1="251" x2="214" y2="251" class="arrow" marker-end="url(#cc-a)"/>
<rect x="220" y="234" width="150" height="34" rx="5" class="box"/>
<text x="295" y="256" text-anchor="middle" class="t-sm">a CSI driver notices</text>
<line x1="374" y1="251" x2="420" y2="251" class="arrow" marker-end="url(#cc-a)"/>
<rect x="426" y="234" width="260" height="34" rx="5" class="box"/>
<text x="556" y="256" text-anchor="middle" class="t-sm">provisions the disk, creates the PV</text>
</svg>
<figcaption>The one component that calls outward — and storage, which pointedly is not part of it.</figcaption>
</figure>

The cloud controller manager is the component that talks to your cloud provider. It's split out from the main controller manager precisely because it's the part that isn't portable — everything else in the control plane is the same on AWS, GCP, and a laptop; this bit isn't.

Its node controller labels VMs with cloud metadata and handles nodes joining and leaving as instances come and go. Its service controller is the one that makes `type: LoadBalancer` mean something — you create a Service, and it goes and provisions an actual cloud load balancer. There's also a route controller for older networking setups, largely deprecated now.

Storage is the interesting omission. You'd expect volume provisioning here, and it isn't — it moved out to CSI drivers. You create a PersistentVolumeClaim, a CSI driver notices, provisions the real disk, and creates the PersistentVolume that binds to your claim. Same reconciliation pattern, separate component.

## What the diagram should have shown

<figure class="diagram">
<svg viewBox="0 0 700 480" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The sequence from kubectl apply to a running container, every step passing back through the API server">
<defs>
<marker id="tr-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<line x1="330" y1="52" x2="330" y2="392" class="rule"/>
<rect x="246" y="14" width="168" height="38" rx="6" class="box-accent"/>
<text x="330" y="39" text-anchor="middle" class="t-strong t-accent">API server</text>
<rect x="20" y="76" width="190" height="42" rx="6" class="box"/>
<text x="115" y="94" text-anchor="middle" class="t-sm">1. you</text>
<text x="115" y="110" text-anchor="middle" class="t-mono">kubectl apply</text>
<line x1="214" y1="97" x2="326" y2="97" class="arrow" marker-end="url(#tr-a)"/>
<text x="346" y="93" class="t-sm">Deployment written to etcd</text>
<rect x="20" y="148" width="190" height="42" rx="6" class="box"/>
<text x="115" y="166" text-anchor="middle" class="t-sm">2. deployment controller</text>
<text x="115" y="182" text-anchor="middle" class="t-sm">sees ADDED</text>
<line x1="326" y1="160" x2="214" y2="160" class="arrow arrow-dash" marker-end="url(#tr-a)"/>
<line x1="214" y1="182" x2="326" y2="182" class="arrow" marker-end="url(#tr-a)"/>
<text x="346" y="176" class="t-sm">pods created, no node assigned</text>
<rect x="20" y="220" width="190" height="42" rx="6" class="box"/>
<text x="115" y="238" text-anchor="middle" class="t-sm">3. scheduler</text>
<text x="115" y="254" text-anchor="middle" class="t-sm">sees an unscheduled pod</text>
<line x1="326" y1="232" x2="214" y2="232" class="arrow arrow-dash" marker-end="url(#tr-a)"/>
<line x1="214" y1="254" x2="326" y2="254" class="arrow" marker-end="url(#tr-a)"/>
<text x="346" y="248" class="t-sm">one field written: nodeName</text>
<rect x="20" y="292" width="190" height="42" rx="6" class="box"/>
<text x="115" y="310" text-anchor="middle" class="t-sm">4. kubelet on that node</text>
<text x="115" y="326" text-anchor="middle" class="t-sm">sees the pod bound to it</text>
<line x1="326" y1="304" x2="214" y2="304" class="arrow arrow-dash" marker-end="url(#tr-a)"/>
<line x1="214" y1="326" x2="326" y2="326" class="arrow" marker-end="url(#tr-a)"/>
<text x="346" y="320" class="t-sm">status reported back</text>
<line x1="330" y1="392" x2="330" y2="412" class="arrow" marker-end="url(#tr-a)"/>
<rect x="240" y="416" width="220" height="42" rx="6" class="box"/>
<text x="350" y="443" text-anchor="middle">container running</text>
<rect x="500" y="366" width="186" height="92" rx="6" class="box-ghost"/>
<line x1="516" y1="392" x2="548" y2="392" class="arrow arrow-dash"/>
<text x="558" y="396" class="t-sm">a watch event</text>
<line x1="516" y1="418" x2="548" y2="418" class="arrow"/>
<text x="558" y="422" class="t-sm">a write, via the</text>
<text x="558" y="440" class="t-sm">API server</text>
<text x="20" y="380" class="t-sm t-strong">Each component's output is the next one's input.</text>
<text x="20" y="400" class="t-sm">None of them called each other.</text>
</svg>
<figcaption>The whole sequence. Every arrow starts or ends at the API server.</figcaption>
</figure>

Walk back through what actually happened. `kubectl` wrote an object. The API server validated it and put it in etcd. The Deployment controller noticed and created pods with no home. The scheduler noticed those and filled in a field. The kubelet noticed that field and built a container. kube-proxy and CoreDNS made it reachable.

Six components. Not one of them called another. Each one watched the API server, saw something it cared about, changed one thing, and wrote the result back — where it became the next component's input.

That's the whole architecture. It's a shared whiteboard with a lot of people staring at it, and the arrows in the diagram aren't calls at all — they're just everyone looking at the same board.

It also explains the failure modes. When something in a Kubernetes cluster doesn't happen, the question is almost never "which component failed to call which". It's "which loop isn't running, or is running and doesn't like what it sees". A pod stuck in `Pending` means the scheduler looked and found nothing feasible. A pod stuck in `ContainerCreating` means the kubelet took ownership and something underneath it — CNI, a volume, an image pull — hasn't finished.

The component you need is whichever one owns the field that isn't getting filled in.

## Sources

- Bibin Wilson — [Kubernetes Architecture](https://blog.techiescamp.com/docs/kubernetes-architecture/), [TechiesCamp](https://blog.techiescamp.com/author/bibin/)
- [Kubernetes Components](https://kubernetes.io/docs/concepts/overview/components/)
- [kube-apiserver](https://kubernetes.io/docs/reference/command-line-tools-reference/kube-apiserver/) · [etcd](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/) · [controllers](https://kubernetes.io/docs/concepts/architecture/controller/)
- [kube-scheduler](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/) · [scheduler configuration](https://kubernetes.io/docs/reference/scheduling/config/)
- [kubelet](https://kubernetes.io/docs/reference/command-line-tools-reference/kubelet/) · [static pods](https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/)
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/) · [DNS for services](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/) · [cloud controller manager](https://kubernetes.io/docs/concepts/architecture/cloud-controller/)

Diagrams are my own.

