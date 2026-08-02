---
title: 'Neural networks, and the one loop that trains them'
description: >-
  Training a network is a single loop around one hard question — which way is
  downhill. Losses, backpropagation, and why mini-batches won.
date: '2026-08-01'
category: ai
tags:
  - deep-learning
  - training
draft: false
source: ai/1-Neural nets.md
updated: '2026-08-02'
---

A neural network is a function with a very large number of adjustable numbers in it. That's the whole object. Everything that follows — losses, gradients, backpropagation, Adam, dropout — exists to answer one question: given that the function is currently wrong, which direction should those numbers move?

Almost all of the machinery is one loop, repeated. What makes it interesting is that the central step of that loop is expensive, and nearly every practical decision in training is a compromise about how to make it cheaper without making it useless.

## The unit, and the stack

<figure class="diagram">
<svg viewBox="0 0 700 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A single perceptron multiplies inputs by weights, sums them, and passes the result through a non-linearity; a layer is many of these side by side">
<defs>
<marker id="pc-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<text x="20" y="24" class="t-sm t-strong">one unit</text>
<circle cx="50" cy="70" r="16" class="box"/><text x="50" y="75" text-anchor="middle" class="t-mono">x₁</text>
<circle cx="50" cy="118" r="16" class="box"/><text x="50" y="123" text-anchor="middle" class="t-mono">x₂</text>
<circle cx="50" cy="166" r="16" class="box"/><text x="50" y="171" text-anchor="middle" class="t-mono">x₃</text>
<line x1="68" y1="70" x2="168" y2="112" class="arrow" marker-end="url(#pc-a)"/>
<line x1="68" y1="118" x2="168" y2="118" class="arrow" marker-end="url(#pc-a)"/>
<line x1="68" y1="166" x2="168" y2="124" class="arrow" marker-end="url(#pc-a)"/>
<text x="110" y="80" class="t-sm">w₁</text>
<text x="110" y="112" class="t-sm">w₂</text>
<text x="110" y="160" class="t-sm">w₃</text>
<circle cx="190" cy="118" r="24" class="box-accent"/>
<text x="190" y="124" text-anchor="middle" class="t-accent">Σ</text>
<line x1="216" y1="118" x2="252" y2="118" class="arrow" marker-end="url(#pc-a)"/>
<rect x="256" y="94" width="92" height="48" rx="6" class="box-accent"/>
<text x="302" y="116" text-anchor="middle" class="t-sm t-accent">non-</text>
<text x="302" y="134" text-anchor="middle" class="t-sm t-accent">linearity</text>
<line x1="352" y1="118" x2="386" y2="118" class="arrow" marker-end="url(#pc-a)"/>
<circle cx="406" cy="118" r="16" class="box"/><text x="406" y="123" text-anchor="middle" class="t-mono">y</text>
<text x="20" y="212" class="t-sm">Weighted sum, then squash. Without the non-linearity, stacking</text>
<text x="20" y="230" class="t-sm">these would collapse into a single matrix multiply.</text>
<line x1="452" y1="30" x2="452" y2="248" class="rule"/>
<text x="478" y="24" class="t-sm t-strong">a layer is just many of them</text>
<circle cx="510" cy="70" r="12" class="box"/>
<circle cx="510" cy="118" r="12" class="box"/>
<circle cx="510" cy="166" r="12" class="box"/>
<circle cx="600" cy="60" r="12" class="box-accent"/>
<circle cx="600" cy="100" r="12" class="box-accent"/>
<circle cx="600" cy="140" r="12" class="box-accent"/>
<circle cx="600" cy="180" r="12" class="box-accent"/>
<line x1="522" y1="70" x2="588" y2="60" class="arrow"/><line x1="522" y1="70" x2="588" y2="100" class="arrow"/>
<line x1="522" y1="70" x2="588" y2="140" class="arrow"/><line x1="522" y1="70" x2="588" y2="180" class="arrow"/>
<line x1="522" y1="118" x2="588" y2="60" class="arrow"/><line x1="522" y1="118" x2="588" y2="100" class="arrow"/>
<line x1="522" y1="118" x2="588" y2="140" class="arrow"/><line x1="522" y1="118" x2="588" y2="180" class="arrow"/>
<line x1="522" y1="166" x2="588" y2="60" class="arrow"/><line x1="522" y1="166" x2="588" y2="100" class="arrow"/>
<line x1="522" y1="166" x2="588" y2="140" class="arrow"/><line x1="522" y1="166" x2="588" y2="180" class="arrow"/>
<text x="478" y="212" class="t-sm">Every unit sees every input.</text>
<text x="478" y="230" class="t-sm">Each has its own weights.</text>
<line x1="20" y1="272" x2="680" y2="272" class="rule"/>
<text x="20" y="300" class="t-sm">The whole network is one big function with a few million knobs on it.</text>
<text x="20" y="320" class="t-sm">Training is the search for knob settings that make the output less wrong.</text>
</svg>
<figcaption>A weighted sum, squashed. A layer is many of these; a network is layers of layers.</figcaption>
</figure>

One unit takes its inputs, multiplies each by a weight, adds them up, and pushes the result through a non-linear function.

That non-linearity is doing more work than it looks like. Without it, a unit is a linear function, a layer of units is a linear function, and a hundred stacked layers are still a linear function — the entire depth collapses into a single matrix you could have written down directly. Depth only buys you anything because something bends the output between the layers.

Stack those units into layers and the layers into a network, and you have a function with a few million knobs on it. Training is the search for a setting of the knobs that makes the output less wrong.

Which requires being precise about "wrong".

## Measuring wrong

A loss function turns a prediction and a correct answer into a single number, where lower is better. Which loss you pick follows directly from what the network outputs.

For a model producing a probability between 0 and 1 — is this spam, is this a tumour — the loss is **binary cross-entropy**:

$$J(\boldsymbol{W}) = -\frac{1}{n} \sum_{i=1}^{n} y^{(i)} \log(f(x^{(i)}; \boldsymbol{W})) + (1 - y^{(i)}) \log(1 - f(x^{(i)}; \boldsymbol{W}))$$

Only one of those two terms survives for any given example, because $y$ is either 0 or 1. If the true answer is 1 and the model said 0.99, $\log(0.99)$ is nearly zero and the loss barely moves. If it said 0.01, $\log(0.01)$ is a large negative number and the loss spikes. The function punishes confident mistakes far harder than uncertain ones, which is exactly the behaviour you want from something producing probabilities.

For a model producing a continuous number — a price, a temperature — it's **mean squared error**:

$$J(\boldsymbol{W}) = \frac{1}{n} \sum_{i=1}^{n} (y^{(i)} - f(x^{(i)}; \boldsymbol{W}))^2$$

Squaring does two things at once. It makes errors positive regardless of direction, and it makes large errors count disproportionately — being off by 10 is a hundred times worse than being off by 1, not ten times.

Either way you now have a single number summarising how wrong the network is across the whole dataset, and the goal can be stated exactly:

$$W^* = \arg\min_{\boldsymbol{W}} J(\boldsymbol{W})$$

Find the weights that make that number smallest.

## Which way is downhill

You can't solve that equation. The function is far too complicated for a closed form. So you do the only thing available: start somewhere random and repeatedly step downhill.

<figure class="diagram">
<svg viewBox="0 0 700 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gradient descent walks downhill on the loss curve; the learning rate sets the step size, and too small crawls while too large overshoots">
<defs>
<marker id="gs-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="gs-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<line x1="40" y1="220" x2="40" y2="40" class="rule" marker-end="url(#gs-a)"/>
<line x1="40" y1="220" x2="440" y2="220" class="rule" marker-end="url(#gs-a)"/>
<text x="16" y="36" class="t-sm">loss</text>
<text x="410" y="240" class="t-sm">weights</text>
<path d="M 60 60 Q 160 250 250 195 Q 320 152 400 66" class="arrow"/>
<circle cx="112" cy="150" r="7" class="box-accent"/>
<text x="80" y="132" class="t-sm t-accent">you are here</text>
<line x1="122" y1="158" x2="168" y2="188" class="arrow arrow-accent" marker-end="url(#gs-b)"/>
<text x="150" y="212" class="t-sm t-accent">step</text>
<text x="60" y="278" class="t-sm">The gradient says which way is uphill.</text>
<text x="60" y="298" class="t-sm">Subtract it and you go down.</text>
<line x1="470" y1="30" x2="470" y2="300" class="rule"/>
<text x="496" y="52" class="t-sm t-strong">the learning rate η</text>
<text x="496" y="86" class="t-sm">too small</text>
<line x1="496" y1="98" x2="516" y2="98" class="arrow" marker-end="url(#gs-a)"/>
<line x1="524" y1="98" x2="544" y2="98" class="arrow" marker-end="url(#gs-a)"/>
<line x1="552" y1="98" x2="572" y2="98" class="arrow" marker-end="url(#gs-a)"/>
<text x="588" y="102" class="t-sm">crawls</text>
<text x="496" y="146" class="t-sm">too large</text>
<path d="M 500 176 Q 540 132 580 176" class="arrow" marker-end="url(#gs-a)"/>
<path d="M 580 176 Q 540 220 500 176" class="arrow" marker-end="url(#gs-a)"/>
<text x="600" y="180" class="t-sm">overshoots</text>
<text x="496" y="230" class="t-sm">This is why adaptive schemes</text>
<text x="496" y="248" class="t-sm">exist — Adam, Adagrad,</text>
<text x="496" y="266" class="t-sm">RMSProp all change η as</text>
<text x="496" y="284" class="t-sm">training goes on.</text>
</svg>
<figcaption>The gradient points uphill, so subtract it. How far you go is the learning rate.</figcaption>
</figure>

The gradient $\frac{\partial J}{\partial W}$ tells you, for every weight, which direction *increases* the loss. So you subtract it:

$$\boldsymbol{W} \leftarrow \boldsymbol{W} - \eta \frac{\partial J(\boldsymbol{W})}{\partial \boldsymbol{W}}$$

Initialise the weights randomly, compute the gradient, take a step, repeat until it stops improving. That is the entire training algorithm. Everything else in this post is a refinement of one of those steps.

$\eta$ is the learning rate — the size of the step. Too small and training crawls, technically converging and practically never finishing. Too large and you leap over the minimum to somewhere worse, bounce back, and oscillate.

Nobody wants to tune that by hand, which is why the learning rate usually isn't a constant. You can decay it on a schedule, or hand it to an adaptive method — Adam, Adagrad, RMSProp — that adjusts it per weight as training goes on.

## Why backpropagation works at all

Computing that gradient is the expensive part, and there's a structural reason it's even possible.

A weight buried in an early layer affects the loss only through everything downstream of it. To know its gradient you have to trace every path from that weight forward to the output and apply the chain rule along each one.

That sounds like it should be intractable, and it would be — except for one property of how networks are wired: **each layer's output depends only on the layer before it.** No unit reaches forward. No unit reaches sideways into its own layer. The dependency graph is a clean sequence.

So you can compute the gradient once at the output and push it backwards layer by layer, reusing the work at every step, instead of recalculating each path from scratch. That's backpropagation. It isn't a clever new idea about calculus — it's the chain rule applied in the one order that avoids repeating yourself, made possible by the network being a sequence rather than a tangle.

## The compromise everything rests on

Here's the practical problem. That gradient is defined over the *whole dataset*. Every weight update, in principle, requires looking at every training example.

For anything real that's absurd. Millions of examples, one step.

<figure class="diagram">
<svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Full batch gives an accurate gradient slowly, a single point gives a noisy one quickly, and a mini-batch sits between them and fits a GPU">
<text x="20" y="24" class="t-sm t-strong">Every variant is estimating the same number. They differ in how much data they look at first.</text>
<rect x="20" y="46" width="205" height="176" rx="6" class="box"/>
<text x="122" y="74" text-anchor="middle" class="t-strong">every data point</text>
<text x="122" y="94" text-anchor="middle" class="t-sm">gradient descent</text>
<line x1="40" y1="112" x2="205" y2="112" class="rule"/>
<text x="36" y="136" class="t-sm">the true gradient</text>
<text x="36" y="158" class="t-sm">one step costs a pass</text>
<text x="36" y="176" class="t-sm">over the whole dataset</text>
<text x="36" y="204" class="t-sm">correct, and unusable</text>
<rect x="247" y="46" width="205" height="176" rx="6" class="box"/>
<text x="349" y="74" text-anchor="middle" class="t-strong">one data point</text>
<text x="349" y="94" text-anchor="middle" class="t-sm">stochastic</text>
<line x1="267" y1="112" x2="432" y2="112" class="rule"/>
<text x="263" y="136" class="t-sm">a very noisy estimate</text>
<text x="263" y="158" class="t-sm">steps are almost free,</text>
<text x="263" y="176" class="t-sm">and wander</text>
<text x="263" y="204" class="t-sm">fast, and unreliable</text>
<rect x="474" y="46" width="206" height="176" rx="6" class="box-accent"/>
<text x="577" y="74" text-anchor="middle" class="t-strong t-accent">a batch of B</text>
<text x="577" y="94" text-anchor="middle" class="t-sm">mini-batch</text>
<line x1="494" y1="112" x2="660" y2="112" class="rule"/>
<text x="490" y="136" class="t-sm">noisy, but averaged</text>
<text x="490" y="158" class="t-sm">the batch computes in</text>
<text x="490" y="176" class="t-sm">parallel on a GPU</text>
<text x="490" y="204" class="t-sm t-accent">the one everyone uses</text>
<line x1="20" y1="248" x2="680" y2="248" class="rule"/>
<text x="20" y="276" class="t-sm">Mini-batch did not win because it is the mathematically pleasing middle.</text>
<text x="20" y="294" class="t-sm">It won because a batch is exactly the shape a GPU wants to be handed.</text>
</svg>
<figcaption>Three ways to estimate the same number, trading accuracy against how long you wait for it.</figcaption>
</figure>

So you approximate. Pick a single random example, compute the gradient from just that one, and step. This is **stochastic gradient descent**, and the estimate is terrible — one example says almost nothing about the dataset — but it is essentially free, and you can take thousands of steps in the time full gradient descent takes one. The path wanders drunkenly and still gets there.

The middle option is what everyone actually uses. Take a batch of $B$ examples and average their gradients:

$$\frac{\partial J(\boldsymbol{W})}{\partial \boldsymbol{W}} = \frac{1}{B} \sum_{k=1}^{B} \frac{\partial J_k(\boldsymbol{W})}{\partial \boldsymbol{W}}$$

Averaging cancels some of the noise from any single example while still costing a fraction of a full pass.

But the reason mini-batches won isn't that they're the mathematically pleasing middle. It's hardware. The gradients within a batch don't depend on each other, so they compute *in parallel* — and a batch of examples is precisely the shape a GPU wants to be handed. Batch size ends up being as much a statement about your hardware as about your optimiser.

## When it learns the wrong thing

Train long enough and the loss keeps falling while the model gets worse. It has started memorising the training set instead of learning anything that transfers.

<figure class="diagram">
<svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dropout zeroes a random subset of units on every pass; early stopping halts when validation loss turns back up">
<defs>
<marker id="rg-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="rg-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead-accent"/></marker>
</defs>
<text x="20" y="24" class="t-strong">Dropout</text>
<text x="106" y="24" class="t-sm">— a different network every pass</text>
<text x="26" y="52" class="t-sm">pass 1</text>
<circle cx="96" cy="90" r="11" class="box"/><circle cx="136" cy="90" r="11" class="box-ghost"/>
<circle cx="176" cy="90" r="11" class="box"/><circle cx="216" cy="90" r="11" class="box"/>
<circle cx="256" cy="90" r="11" class="box-ghost"/>
<text x="26" y="140" class="t-sm">pass 2</text>
<circle cx="96" cy="130" r="11" class="box-ghost"/><circle cx="136" cy="130" r="11" class="box"/>
<circle cx="176" cy="130" r="11" class="box"/><circle cx="216" cy="130" r="11" class="box-ghost"/>
<circle cx="256" cy="130" r="11" class="box"/>
<text x="290" y="94" class="t-sm">dotted units are</text>
<text x="290" y="112" class="t-sm">forced to zero, chosen</text>
<text x="290" y="130" class="t-sm">fresh each time</text>
<text x="20" y="184" class="t-sm">No unit can rely on any other being there, so the network</text>
<text x="20" y="202" class="t-sm">cannot build a single brittle path through itself.</text>
<line x1="470" y1="30" x2="470" y2="290" class="rule"/>
<text x="496" y="24" class="t-strong">Early stopping</text>
<line x1="500" y1="150" x2="500" y2="50" class="rule" marker-end="url(#rg-a)"/>
<line x1="500" y1="150" x2="628" y2="150" class="rule" marker-end="url(#rg-a)"/>
<text x="480" y="46" class="t-sm">loss</text>
<text x="560" y="170" text-anchor="middle" class="t-sm">epochs</text>
<path d="M 506 62 Q 552 118 622 138" class="arrow"/>
<text x="636" y="142" class="t-sm">training</text>
<path d="M 506 70 Q 550 116 574 112 Q 604 106 622 68" class="arrow arrow-accent"/>
<text x="636" y="72" class="t-sm t-accent">validation</text>
<circle cx="578" cy="111" r="5" class="box-accent"/>
<line x1="578" y1="111" x2="578" y2="150" class="arrow arrow-dash" marker-end="url(#rg-b)"/>
<text x="496" y="196" class="t-sm">Training loss keeps falling because</text>
<text x="496" y="214" class="t-sm">the model is memorising. Validation</text>
<text x="496" y="232" class="t-sm">loss turning back up is the moment</text>
<text x="496" y="250" class="t-sm">it stopped learning anything general.</text>
<text x="496" y="278" class="t-sm t-accent">Stop there.</text>
</svg>
<figcaption>Dropout stops any single path becoming load-bearing. Early stopping catches the moment generalisation ends.</figcaption>
</figure>

**Dropout** attacks this directly. On every pass, randomly zero out some fraction of the units — a different random selection each time. A unit can't come to depend on any particular other unit being there, because next pass it might not be. It stops the network building one brittle, highly specific path through itself, and it works remarkably well for something so crude.

**Early stopping** is simpler still and requires no change to the model at all. Watch the loss on data you aren't training on. It falls alongside the training loss for a while, then turns back up — and that turn is the moment the model stopped learning general structure and started memorising. Stop there, keep those weights.

What I like about early stopping is how unpretentious it is. No clever regularisation term, no theory. Just an admission that the model will overfit if you let it, and a decision to take the keys away at the right moment.

## Sources

- [MIT 6.S191: Introduction to Deep Learning](http://introtodeeplearning.com/) — Alexander Amini and Ava Amini. These notes came from the lectures.
- [Lecture videos](https://www.youtube.com/playlist?list=PLtBw6njQRU-rwp5__7C0oIVt26ZgjG9NI)

Diagrams are my own.

