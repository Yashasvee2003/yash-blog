---
title: Everything that has to be right for two pods to talk
description: >-
  A packet from a pod in one VPC to a pod in another passes about ten
  checkpoints, most of which fail silently. Here is all of them, in order.
date: '2026-08-02'
category: platform-eng
tags: []
draft: false
source: platform-eng/cloud/Networking.md
updated: '2026-08-02'
---

Pod A can't reach pod B. They're in different clusters, in different VPCs, connected by a transit gateway. The request just hangs, and eventually times out.

Nothing is on fire. No alarm fired, no error appeared in any log, nothing was rejected. A packet went somewhere and quietly stopped existing.

This is the characteristic failure of cloud networking, and it's what makes it miserable to debug: almost every component in the path fails by **dropping**, not by refusing. There's no rejection to find. You can't work backwards from an error, because there wasn't one — so the only way through is to know every checkpoint the packet has to clear and check them one at a time.

So here they all are.

## The parts, in the order a packet meets them

A **VPC** is your slice of the datacenter, defined by a CIDR block — `10.0.0.0/16`. A **subnet** carves a piece out of that range and pins it to a single availability zone. Everything you run sits in one.

The thing that surprises people is what makes a subnet public.

<figure class="diagram">
<svg viewBox="0 0 700 380" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A VPC with a private subnet routing to a NAT gateway and a public subnet routing to an internet gateway; what makes a subnet public is its route table">
<defs>
<marker id="vl-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="vl-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<rect x="20" y="40" width="470" height="290" rx="8" class="box-ghost"/>
<text x="36" y="64" class="t-sm t-strong">VPC</text>
<text x="76" y="64" class="t-mono t-sm">10.0.0.0/16</text>
<rect x="40" y="84" width="200" height="104" rx="6" class="box"/>
<text x="56" y="106" class="t-sm t-strong">private subnet</text>
<text x="56" y="126" class="t-mono t-sm">10.0.2.0/24 · az-b</text>
<rect x="56" y="138" width="168" height="34" rx="4" class="box"/>
<text x="140" y="159" text-anchor="middle" class="t-mono">0.0.0.0/0 → nat</text>
<rect x="270" y="84" width="200" height="104" rx="6" class="box"/>
<text x="286" y="106" class="t-sm t-strong">public subnet</text>
<text x="286" y="126" class="t-mono t-sm">10.0.1.0/24 · az-a</text>
<rect x="286" y="138" width="168" height="34" rx="4" class="box-accent"/>
<text x="370" y="159" text-anchor="middle" class="t-mono">0.0.0.0/0 → igw</text>
<rect x="40" y="216" width="200" height="44" rx="6" class="box"/>
<text x="140" y="243" text-anchor="middle" class="t-sm">EC2, no public IP</text>
<rect x="270" y="216" width="200" height="44" rx="6" class="box"/>
<text x="370" y="243" text-anchor="middle" class="t-sm">NAT gateway</text>
<line x1="244" y1="238" x2="266" y2="238" class="arrow" marker-end="url(#vl-a)"/>
<line x1="370" y1="212" x2="370" y2="192" class="arrow" marker-end="url(#vl-a)"/>
<rect x="530" y="112" width="150" height="60" rx="6" class="box-accent"/>
<text x="605" y="138" text-anchor="middle" class="t-accent t-strong">internet</text>
<text x="605" y="158" text-anchor="middle" class="t-accent t-strong">gateway</text>
<line x1="474" y1="142" x2="524" y2="142" class="arrow arrow-accent" marker-start="url(#vl-b)" marker-end="url(#vl-b)"/>
<text x="530" y="194" class="t-sm">one per VPC</text>
<text x="530" y="212" class="t-sm">ingress and egress</text>
<text x="40" y="290" class="t-sm">The NAT sits in the public subnet, and gives the private one</text>
<text x="40" y="308" class="t-sm">egress only — nothing outside can start a conversation with</text>
<text x="40" y="326" class="t-sm">an instance that has no public address.</text>
<line x1="510" y1="244" x2="690" y2="244" class="rule"/>
<text x="530" y="276" class="t-sm t-strong">A subnet is not</text>
<text x="530" y="294" class="t-sm t-strong">public by nature.</text>
<text x="530" y="320" class="t-sm">It is public because</text>
<text x="530" y="338" class="t-sm">its route table has a</text>
<text x="530" y="356" class="t-sm">path to the gateway.</text>
</svg>
<figcaption>A subnet is public because of its route table, not because of anything about the subnet.</figcaption>
</figure>

There is no "public" flag. A subnet is public **because its route table has an entry pointing `0.0.0.0/0` at an internet gateway**. That's the whole difference. Change the route table and a public subnet becomes private without anything inside it moving.

A route table is just a list of "traffic for this CIDR goes to that thing":

```
0.0.0.0/0     → igw-abc123    # anything not local, to the internet gateway
10.0.0.0/16   → local         # anything inside the VPC stays inside
```

Note what routes don't have: any concept of inbound versus outbound, or allow versus deny. A route table is not a firewall. It answers "where does this go next", nothing else. Every route is a next hop.

The **internet gateway** is the door to the internet, one per VPC, carrying traffic in both directions. To actually use it you need three things at once — a route to it, a subnet with that route, and a device with a public IP. Miss any one and nothing works.

A **NAT gateway** is for instances that need to reach out without being reachable. It lives in a *public* subnet and gives private instances egress only. They can call out to fetch packages; nothing on the internet can start a conversation with them. It's also zone-specific, which matters for availability in a way that's easy to miss until an AZ goes down.

A **transit gateway** connects VPCs to each other — one hub instead of a mesh of peering connections. And, importantly for later, **it has its own route table**, separate from every VPC's.

## The two firewalls, and the one that catches everyone

Now the part that actually generates the outages.

There are two firewalls in a VPC, they operate at different levels, and they behave differently in a way that isn't obvious.

<figure class="diagram">
<svg viewBox="0 0 700 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Security groups are stateful so return traffic is automatic; network ACLs are stateless so the reply needs its own rule on ephemeral ports">
<defs>
<marker id="sn-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="sn-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<rect x="20" y="34" width="320" height="132" rx="6" class="box-accent"/>
<text x="40" y="60" class="t-strong t-accent">security group</text>
<text x="40" y="82" class="t-sm">wraps an instance · stateful · allow only</text>
<line x1="40" y1="106" x2="200" y2="106" class="arrow arrow-accent" marker-end="url(#sn-b)"/>
<text x="212" y="110" class="t-sm">you allowed this</text>
<line x1="200" y1="136" x2="40" y2="136" class="arrow arrow-accent arrow-dash" marker-end="url(#sn-b)"/>
<text x="212" y="140" class="t-sm">reply is automatic</text>
<rect x="360" y="34" width="320" height="132" rx="6" class="box"/>
<text x="380" y="60" class="t-strong">network ACL</text>
<text x="380" y="82" class="t-sm">wraps a subnet · stateless · allow or deny</text>
<line x1="380" y1="106" x2="540" y2="106" class="arrow" marker-end="url(#sn-a)"/>
<text x="552" y="110" class="t-sm">you allowed this</text>
<line x1="540" y1="136" x2="380" y2="136" class="arrow arrow-dash" marker-end="url(#sn-a)"/>
<text x="552" y="132" class="t-sm">and the reply is</text>
<text x="552" y="150" class="t-sm">still blocked</text>
<line x1="20" y1="194" x2="680" y2="194" class="rule"/>
<text x="20" y="224" class="t-sm t-strong">This is where the hours go.</text>
<text x="20" y="252" class="t-sm">A NACL has no memory of the outbound packet, so the reply is judged on its own terms — and</text>
<text x="20" y="270" class="t-sm">a reply does not come back on port 443. It comes back to whatever ephemeral port the client</text>
<text x="20" y="288" class="t-sm">picked. Both directions need a rule:</text>
<rect x="20" y="300" width="300" height="28" rx="4" class="box"/>
<text x="34" y="319" class="t-mono">egress  ALLOW 443 → server</text>
<rect x="340" y="300" width="340" height="28" rx="4" class="box-accent"/>
<text x="354" y="319" class="t-mono">ingress ALLOW 1024–65535 ← server</text>
</svg>
<figcaption>A security group remembers the outbound packet. A NACL doesn't, and that's the trap.</figcaption>
</figure>

A **security group** wraps an instance. Every rule is an allow — there is no deny — and all rules are evaluated together before a decision. It can reference an IP, a CIDR, or *another security group*, which is genuinely useful: "allow from anything wearing the load balancer's badge" survives instances being replaced, which a hardcoded IP doesn't.

A **network ACL** wraps a subnet. Rules can allow *or* deny, they're evaluated in order, and the first match wins — later rules never run. One NACL per subnet, and rules can only reference CIDRs, not other groups.

But the difference that costs you an afternoon is this: **security groups are stateful and NACLs are not.**

A security group remembers that you sent something out, so the reply is allowed back automatically. A NACL has no memory. It judges the returning packet entirely on its own merits — and the reply doesn't arrive on port 443. It arrives at whatever ephemeral port the client picked, somewhere in 1024–65535.

So a NACL that allows outbound 443 and nothing else will let your request out and silently drop the response. From the application's point of view the server never answered. You need a rule for the return path, on ephemeral ports, in the opposite direction — for both subnets involved.

Every NACL rule is really two rules.

## Load balancers

<figure class="diagram">
<svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An ALB reads HTTP and routes on paths and hostnames; an NLB forwards at layer four and is faster; Kubernetes objects map to each">
<text x="20" y="24" class="t-strong t-accent">ALB</text>
<text x="70" y="24" class="t-sm">— layer 7, reads the request</text>
<rect x="20" y="42" width="310" height="122" rx="6" class="box-accent"/>
<text x="36" y="68" class="t-sm">routes on path, hostname, cookie</text>
<rect x="36" y="80" width="278" height="24" rx="3" class="box fill-bg"/>
<text x="46" y="97" class="t-mono">/api/*  → service-a</text>
<rect x="36" y="110" width="278" height="24" rx="3" class="box fill-bg"/>
<text x="46" y="127" class="t-mono">/admin/* → service-b</text>
<text x="36" y="152" class="t-sm">terminates TLS · web APIs, microservices</text>
<text x="370" y="24" class="t-strong">NLB</text>
<text x="420" y="24" class="t-sm">— layer 4, forwards packets</text>
<rect x="370" y="42" width="310" height="122" rx="6" class="box"/>
<text x="386" y="68" class="t-sm">routes on IP and port only</text>
<rect x="386" y="80" width="278" height="24" rx="3" class="box fill-bg"/>
<text x="396" y="97" class="t-mono">:9092 → the kafka pods</text>
<text x="386" y="126" class="t-sm">very low latency · can pass TLS straight</text>
<text x="386" y="144" class="t-sm">through, untouched</text>
<text x="386" y="162" class="t-sm">gRPC, TCP, kafka, redis</text>
<line x1="20" y1="192" x2="680" y2="192" class="rule"/>
<text x="20" y="220" class="t-sm t-strong">and in Kubernetes you never create either directly</text>
<rect x="20" y="234" width="200" height="28" rx="4" class="box"/>
<text x="34" y="253" class="t-mono">kind: Ingress</text>
<text x="232" y="253" class="t-sm">→ the AWS load balancer controller creates an ALB</text>
<rect x="20" y="270" width="200" height="28" rx="4" class="box"/>
<text x="34" y="289" class="t-mono">type: LoadBalancer</text>
<text x="232" y="289" class="t-sm">→ the same controller creates an NLB</text>
</svg>
<figcaption>Layer 7 reads the request. Layer 4 forwards the packet. Kubernetes picks for you based on which object you create.</figcaption>
</figure>

An **ALB** works at layer 7, so it understands HTTP: it can route on path, hostname, or cookie, and terminate TLS. That's what you want for web APIs and microservices, where routing decisions depend on what the request says.

An **NLB** works at layer 4 — IP and port only, no idea what's inside. In exchange it's substantially faster and can pass TLS through untouched to the backend. That's what you want for gRPC, raw TCP, Kafka, Redis: protocols where an L7 proxy has nothing useful to contribute and only adds latency.

In Kubernetes you don't create either one directly. You create an object, and the AWS load balancer controller — a pod in `kube-system` — sees it and provisions the real thing. An `Ingress` becomes an ALB. A `Service` of `type: LoadBalancer` becomes an NLB.

That indirection is worth holding onto when debugging. The load balancer you're staring at in the console was created by a controller reading Kubernetes objects, so if it's configured wrong, the wrong thing is usually the annotation on the object, not the load balancer.

One more thing that trips people up: a public load balancer still sits behind the internet gateway. Traffic hits the IGW *first*, then the load balancer. So the subnet the load balancer lives in needs its own route to the gateway — the load balancer being "public" doesn't exempt it from the route table.

## The whole path

Now put it together. A pod in VPC A wants to talk to a service in VPC B, across a transit gateway.

<figure class="diagram">
<svg viewBox="0 0 700 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Every checkpoint a packet passes on its way from a pod in one VPC to a pod in another, each of which can silently drop it">
<defs>
<marker id="cv-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<text x="20" y="22" class="t-sm t-strong">resolve the name — no packet leaves the VPC yet</text>
<rect x="20" y="34" width="300" height="26" rx="4" class="box-ghost"/>
<text x="32" y="52" class="t-sm">CoreDNS → VPC resolver → Route 53</text>
<text x="332" y="52" class="t-sm">returns the NLB's ENI addresses</text>
<line x1="20" y1="76" x2="680" y2="76" class="rule"/>
<text x="20" y="100" class="t-sm t-strong">leaving VPC A</text>
<rect x="20" y="112" width="330" height="28" rx="4" class="box"/>
<text x="32" y="131" class="t-sm">pod A → node A, by local Linux routing</text>
<rect x="20" y="148" width="330" height="28" rx="4" class="box-accent"/>
<text x="32" y="167" class="t-sm">node A security group · egress</text>
<text x="362" y="167" class="t-mono t-sm">443 → VPC B</text>
<rect x="20" y="184" width="330" height="28" rx="4" class="box-accent"/>
<text x="32" y="203" class="t-sm">subnet A NACL · egress</text>
<text x="362" y="203" class="t-mono t-sm">443 out, 1024–65535 back</text>
<rect x="20" y="220" width="330" height="28" rx="4" class="box"/>
<text x="32" y="239" class="t-sm">VPC A route table</text>
<text x="362" y="239" class="t-mono t-sm">10.1.0.0/16 → tgw</text>
<line x1="20" y1="264" x2="680" y2="264" class="rule"/>
<text x="20" y="288" class="t-sm t-strong">crossing</text>
<rect x="20" y="300" width="330" height="28" rx="4" class="box-accent"/>
<text x="32" y="319" class="t-sm">transit gateway route table</text>
<text x="362" y="319" class="t-sm">its own table, easily forgotten</text>
<line x1="20" y1="344" x2="680" y2="344" class="rule"/>
<text x="20" y="368" class="t-sm t-strong">arriving in VPC B</text>
<rect x="20" y="380" width="330" height="28" rx="4" class="box"/>
<text x="32" y="399" class="t-sm">VPC B route table · return path</text>
<text x="362" y="399" class="t-mono t-sm">10.0.0.0/16 → tgw</text>
<rect x="20" y="416" width="330" height="28" rx="4" class="box-accent"/>
<text x="32" y="435" class="t-sm">subnet B NACL · ingress</text>
<text x="362" y="435" class="t-mono t-sm">443 in, ephemeral out</text>
<rect x="20" y="452" width="330" height="28" rx="4" class="box-accent"/>
<text x="32" y="471" class="t-sm">internal NLB security group</text>
<text x="362" y="471" class="t-sm">from VPC A CIDR or node A's SG</text>
<rect x="20" y="488" width="330" height="28" rx="4" class="box-accent"/>
<text x="32" y="507" class="t-sm">node B SG + subnet B NACL</text>
<text x="362" y="507" class="t-mono t-sm">30000–32767</text>
<rect x="20" y="524" width="330" height="28" rx="4" class="box"/>
<text x="32" y="543" class="t-sm">kube-proxy → pod B</text>
<text x="362" y="543" class="t-sm">outlined boxes can drop you silently</text>
</svg>
<figcaption>Every checkpoint, in order. The outlined ones drop packets without telling you.</figcaption>
</figure>

It starts with a name, and the name resolution never leaves your VPC. CoreDNS forwards to the VPC resolver, which asks Route 53, which hands back the addresses of the internal NLB's network interfaces in VPC B. No security group applies, no route table is consulted, no transit gateway is involved. **Nothing has been sent to VPC B yet** — you just know where it lives.

Then the packet actually moves, and here is everything it has to clear:

**Out of VPC A.** From pod to node, by ordinary Linux routing inside the host. Then node A's security group has to allow egress to VPC B's CIDR or to the NLB's security group. Then subnet A's NACL has to allow it out — *and* allow the reply back on ephemeral ports. Then VPC A's route table has to send `10.1.0.0/16` to the transit gateway.

**Across.** The transit gateway consults **its own route table**, which is a separate thing from either VPC's and the one people forget exists. It needs an entry sending that CIDR to VPC B's attachment.

**Into VPC B.** VPC B's route table needs the *return* route back to the transit gateway, or the reply has nowhere to go. Subnet B's NACL has to allow ingress on 443 and egress on ephemeral ports. The NLB's security group has to allow traffic from VPC A's CIDR or from node A's security group.

Then the NLB picks a healthy target, preserving the source IP. From here it can go one of two ways, and this is configurable from Kubernetes: it can forward to a node's NodePort and let kube-proxy do the rest, or it can send straight to the pod IP. If it's NodePort, node B's security group has to allow the 30000–32767 range from the NLB's security group, and subnet B's NACL has to allow it too.

Finally kube-proxy rewrites the destination to the pod, and pod B receives a packet.

Around ten independent checkpoints, spread across two VPCs, a transit gateway, four firewall objects and three route tables. All of them have to agree. Any one of them can drop the packet without recording that it did.

## Why it's like this

It would be easy to read that list as accidental complexity, and some of it is. But most of it isn't.

Every checkpoint exists because someone can configure it independently. The security group belongs to whoever owns the workload, the NACL to whoever owns the subnet, the route tables to whoever owns the network, and the transit gateway to whoever owns the organisation's connectivity. That's a real division of responsibility in a large company, and it's the reason there are four places to make the same mistake.

Which suggests the practical approach, and it's the one thing I'd want anyone to take from this. When a packet vanishes, don't go looking for what's broken — nothing is broken, everything is behaving exactly as configured. **Walk the path in order and check each hop against what it's supposed to allow.** It's slow and it's boring, and it's much faster than guessing.

And when you check a NACL, check both directions. It's almost always the NACL.

## Sources

- [Amazon VPC User Guide](https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html)
- [Security groups](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html) · [network ACLs](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html) · [route tables](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html)
- [NAT gateways](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html) · [Transit Gateway](https://docs.aws.amazon.com/vpc/latest/tgw/what-is-transit-gateway.html)
- [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/latest/)

Diagrams are my own.

