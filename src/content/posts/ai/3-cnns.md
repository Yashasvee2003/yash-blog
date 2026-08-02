---
title: 'What CNNs keep, and what they throw away'
description: >-
  Convolution buys equivariance, pooling buys invariance, and the two are not
  the same thing. Plus the trade every CNN makes: knowing what, at the cost of
  knowing where.
date: '2026-08-01'
category: ai
tags:
  - deep-learning
  - computer-vision
draft: false
source: ai/3- CNNs.md
updated: '2026-08-02'
---

Almost every explanation of convolutional networks says they "handle translation" — that a CNN recognises a cat whether it's top-left or bottom-right. Which is true, and hides the fact that two different mechanisms are doing two different jobs, and only one of them is what people usually mean.

Convolution gives you **equivariance**. Pooling gives you **invariance**. Getting those the wrong way round makes the rest of the architecture look arbitrary, so it's worth pulling apart.

But first, why not just use an ordinary network.

## The obvious approach, and why it fails

A dense layer wants a flat vector. An image is a grid. So flatten it — read the pixels row by row into one long list — and feed that in.

<figure class="diagram">
<svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flattening an image into a vector destroys the adjacency between neighbouring pixels and produces an enormous number of weights">
<defs>
<marker id="fl-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<text x="20" y="24" class="t-sm t-strong">the image</text>
<rect x="20" y="40" width="120" height="120" rx="4" class="box"/>
<line x1="20" y1="80" x2="140" y2="80" class="rule"/><line x1="20" y1="120" x2="140" y2="120" class="rule"/>
<line x1="60" y1="40" x2="60" y2="160" class="rule"/><line x1="100" y1="40" x2="100" y2="160" class="rule"/>
<rect x="62" y="82" width="36" height="36" class="box-accent"/>
<rect x="102" y="82" width="36" height="36" class="box-accent"/>
<text x="20" y="184" class="t-sm">two neighbouring pixels</text>
<line x1="150" y1="100" x2="196" y2="100" class="arrow" marker-end="url(#fl-a)"/>
<text x="173" y="88" text-anchor="middle" class="t-sm">flatten</text>
<text x="210" y="24" class="t-sm t-strong">the vector fed to a dense layer</text>
<rect x="210" y="60" width="26" height="26" class="box"/><rect x="240" y="60" width="26" height="26" class="box"/>
<rect x="270" y="60" width="26" height="26" class="box"/><rect x="300" y="60" width="26" height="26" class="box-accent"/>
<rect x="330" y="60" width="26" height="26" class="box"/><rect x="360" y="60" width="26" height="26" class="box"/>
<rect x="390" y="60" width="26" height="26" class="box"/><rect x="420" y="60" width="26" height="26" class="box-accent"/>
<rect x="450" y="60" width="26" height="26" class="box"/><rect x="480" y="60" width="26" height="26" class="box"/>
<text x="210" y="112" class="t-sm">The two accented cells were touching.</text>
<text x="210" y="130" class="t-sm">Now they are four apart, and nothing in the</text>
<text x="210" y="148" class="t-sm">representation says they were ever related.</text>
<text x="210" y="184" class="t-sm">The network has to learn adjacency from scratch,</text>
<text x="210" y="202" class="t-sm">from data, for every pair of pixels.</text>
<line x1="20" y1="230" x2="680" y2="230" class="rule"/>
<text x="20" y="258" class="t-sm">And it is enormous. A modest 256×256 colour image is ~196,000 inputs, so a single</text>
<text x="20" y="276" class="t-sm">1,000-unit dense layer needs ~196 million weights — for one layer, on a small image.</text>
</svg>
<figcaption>Flattening turns neighbours into strangers, and the parameter count explodes.</figcaption>
</figure>

Two things go wrong, and the second is the interesting one.

The obvious problem is size. A 256×256 colour image is around 196,000 numbers. Connect that to a single modest hidden layer of 1,000 units and you need roughly 196 million weights — for one layer, on a small image. It doesn't fit, and if it did it would overfit instantly.

The subtler problem is that flattening **destroys the structure that made it an image**. Two pixels that were touching end up hundreds of positions apart in the vector, and nothing in the representation records that they were ever related. The network isn't given the fact that nearby pixels are meaningfully connected — it has to rediscover it from data, separately, for every pair. You've handed it a much harder problem than the one you actually have.

Everything about a CNN follows from refusing to throw that structure away.

## Kernels, filters, and what's actually learned

<figure class="diagram">
<svg viewBox="0 0 700 310" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A kernel is two-dimensional; a filter is a stack of kernels matching the input depth; using several filters sets the output depth">
<defs>
<marker id="kf-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<text x="20" y="24" class="t-strong">kernel</text>
<text x="94" y="24" class="t-sm">— flat, 2D</text>
<rect x="20" y="42" width="72" height="72" rx="3" class="box"/>
<line x1="44" y1="42" x2="44" y2="114" class="rule"/><line x1="68" y1="42" x2="68" y2="114" class="rule"/>
<line x1="20" y1="66" x2="92" y2="66" class="rule"/><line x1="20" y1="90" x2="92" y2="90" class="rule"/>
<text x="20" y="140" class="t-sm">one grid of numbers</text>
<line x1="20" y1="164" x2="230" y2="164" class="rule"/>
<text x="20" y="192" class="t-strong t-accent">filter</text>
<text x="80" y="192" class="t-sm">— a stack of them</text>
<rect x="20" y="210" width="60" height="60" rx="3" class="box-accent"/>
<rect x="34" y="224" width="60" height="60" rx="3" class="box-accent"/>
<rect x="48" y="238" width="60" height="60" rx="3" class="box-accent"/>
<text x="126" y="246" class="t-sm">one kernel per input</text>
<text x="126" y="264" class="t-sm">channel — depth must</text>
<text x="126" y="282" class="t-sm">match the input's depth</text>
<line x1="270" y1="30" x2="270" y2="290" class="rule"/>
<text x="300" y="24" class="t-sm t-strong">and the number of filters sets the output depth</text>
<rect x="300" y="52" width="90" height="90" rx="3" class="box"/>
<rect x="312" y="64" width="90" height="90" rx="3" class="box"/>
<rect x="324" y="76" width="90" height="90" rx="3" class="box"/>
<text x="300" y="192" class="t-sm">input — 3 channels</text>
<line x1="428" y1="110" x2="472" y2="110" class="arrow" marker-end="url(#kf-a)"/>
<text x="450" y="98" text-anchor="middle" class="t-sm">×5</text>
<text x="450" y="132" text-anchor="middle" class="t-sm">filters</text>
<rect x="486" y="52" width="70" height="70" rx="3" class="box-accent"/>
<rect x="496" y="62" width="70" height="70" rx="3" class="box-accent"/>
<rect x="506" y="72" width="70" height="70" rx="3" class="box-accent"/>
<rect x="516" y="82" width="70" height="70" rx="3" class="box-accent"/>
<rect x="526" y="92" width="70" height="70" rx="3" class="box-accent"/>
<text x="486" y="192" class="t-sm">output — 5 channels</text>
<text x="300" y="230" class="t-sm">Each filter is looking for one thing. Five filters means five</text>
<text x="300" y="248" class="t-sm">feature maps stacked up, one per thing you're looking for.</text>
<text x="300" y="276" class="t-sm">Nobody hand-picks what those things are — the values</text>
<text x="300" y="294" class="t-sm">inside each filter are learned by backpropagation.</text>
</svg>
<figcaption>A kernel is one grid. A filter is a stack of them, one per input channel.</figcaption>
</figure>

The vocabulary here gets used loosely, and the distinction matters once you're reading about channel counts.

A **kernel** is two-dimensional — a small grid of numbers, maybe 3×3.

A **filter** is three-dimensional: a stack of kernels, one for each channel of the input. Feed it a colour image with three channels and each filter contains three kernels. The filter's depth is not a choice; it's dictated by the input.

What *is* a choice is how many filters you use, and that sets the depth of the output. Five filters produce five feature maps stacked up — each one the response of a different learned pattern across the whole image. This is why channel counts grow as you go deeper: you're looking for more distinct things.

And the numbers inside those filters aren't designed. You could hand-engineer them — classical computer vision did exactly that, with hand-tuned edge detectors — but in a CNN they're weights, learned by backpropagation like any others. The network works out what's worth looking for.

That's the real break from classical machine learning on images. There, feature extraction was a human job: someone decided edges and corners and textures mattered, wrote code to find them, and fed the results to a classifier. A CNN learns the features and the classification together, from the same gradient signal.

## Seeing more by looking at less

A convolution slides its filter across the image, computing one output per position. Move it one pixel at a time and the output is nearly as large as the input; move it two — a **stride** of two — and the output is roughly half the size in each dimension.

**Pooling** shrinks it more aggressively: take a region and reduce it to one number, usually the largest.

The obvious reason to shrink is cost. The more interesting reason is what it does to how much each unit can see.

<figure class="diagram">
<svg viewBox="0 0 700 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Each layer's receptive field covers more of the original image; pooling shrinks the map and accelerates that growth">
<defs>
<marker id="rf-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<text x="20" y="24" class="t-sm t-strong">how much of the original image one unit can see</text>
<rect x="20" y="44" width="130" height="130" rx="3" class="box"/>
<rect x="66" y="90" width="38" height="38" class="box-accent"/>
<text x="20" y="196" class="t-sm">layer 1</text>
<text x="20" y="214" class="t-sm">a small patch</text>
<line x1="160" y1="108" x2="196" y2="108" class="arrow" marker-end="url(#rf-a)"/>
<rect x="206" y="44" width="130" height="130" rx="3" class="box"/>
<rect x="240" y="78" width="62" height="62" class="box-accent"/>
<text x="206" y="196" class="t-sm">layer 2</text>
<text x="206" y="214" class="t-sm">each unit pools several</text>
<text x="206" y="232" class="t-sm">layer-1 patches</text>
<line x1="346" y1="108" x2="382" y2="108" class="arrow" marker-end="url(#rf-a)"/>
<rect x="392" y="44" width="130" height="130" rx="3" class="box"/>
<rect x="408" y="60" width="98" height="98" class="box-accent"/>
<text x="392" y="196" class="t-sm">layer 4</text>
<text x="392" y="214" class="t-sm">most of the image</text>
<line x1="556" y1="34" x2="556" y2="256" class="rule"/>
<text x="580" y="60" class="t-sm">Depth is why deep</text>
<text x="580" y="78" class="t-sm">layers see high-level</text>
<text x="580" y="96" class="t-sm">features — they are</text>
<text x="580" y="114" class="t-sm">simply looking at</text>
<text x="580" y="132" class="t-sm">more.</text>
<text x="580" y="166" class="t-sm">Pooling and a larger</text>
<text x="580" y="184" class="t-sm">stride both speed</text>
<text x="580" y="202" class="t-sm">this up by shrinking</text>
<text x="580" y="220" class="t-sm">the map underneath.</text>
<text x="20" y="274" class="t-sm">Shrinking the feature map is not just about saving compute — it is how the network widens its view.</text>
</svg>
<figcaption>Each layer sees more of the original image than the last. Shrinking the map accelerates that.</figcaption>
</figure>

A unit's **receptive field** is how much of the original image feeds into it. In the first layer that's just the filter's own footprint — a 3×3 patch. But a unit in the second layer covers a 3×3 patch of *first-layer outputs*, each of which already covered a 3×3 patch of image, so it sees considerably more. Stack enough layers and a single unit near the end is looking at most of the picture.

This is the actual reason deep layers detect high-level structure. It's not that something abstract happens with depth — it's that a deep unit is simply looking at more of the image at once. Early layers see edges because an edge is all you can see in a 3×3 window. Later layers can see a face because they can see a face-sized region.

Pooling and stride accelerate this. Halve the feature map and every subsequent filter covers twice as much original image for the same cost. Downsampling isn't only an efficiency measure — it's how the network widens its view.

## Equivariance is not invariance

Now the distinction the whole post is about.

<figure class="diagram">
<svg viewBox="0 0 700 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Convolution is equivariant — move the input and the detection moves with it. Pooling is invariant — move the input and the output stays the same">
<defs>
<marker id="eq-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
</defs>
<text x="20" y="24" class="t-strong t-accent">Convolution is equivariant</text>
<text x="248" y="24" class="t-sm">— move the input, the detection moves with it</text>
<rect x="20" y="42" width="96" height="96" rx="3" class="box"/>
<circle cx="48" cy="70" r="10" class="box-accent"/>
<line x1="126" y1="90" x2="158" y2="90" class="arrow" marker-end="url(#eq-a)"/>
<rect x="168" y="42" width="96" height="96" rx="3" class="box"/>
<rect x="182" y="56" width="28" height="28" class="box-accent"/>
<text x="278" y="70" class="t-sm">feature found</text>
<text x="278" y="88" class="t-sm">top left</text>
<rect x="380" y="42" width="96" height="96" rx="3" class="box"/>
<circle cx="448" cy="110" r="10" class="box-accent"/>
<line x1="486" y1="90" x2="518" y2="90" class="arrow" marker-end="url(#eq-a)"/>
<rect x="528" y="42" width="96" height="96" rx="3" class="box"/>
<rect x="582" y="96" width="28" height="28" class="box-accent"/>
<text x="636" y="70" class="t-sm">found</text>
<text x="636" y="88" class="t-sm">bottom</text>
<text x="636" y="106" class="t-sm">right</text>
<text x="20" y="166" class="t-sm">The same filter slides over the whole image, so a feature is detected wherever it appears —</text>
<text x="20" y="184" class="t-sm">and the position of the detection tracks the position of the thing.</text>
<line x1="20" y1="206" x2="680" y2="206" class="rule"/>
<text x="20" y="236" class="t-strong">Pooling is invariant</text>
<text x="186" y="236" class="t-sm">— move the input, the output does not change</text>
<rect x="20" y="252" width="60" height="60" rx="3" class="box"/>
<rect x="26" y="258" width="22" height="22" class="box-accent"/>
<line x1="90" y1="282" x2="118" y2="282" class="arrow" marker-end="url(#eq-a)"/>
<rect x="128" y="266" width="32" height="32" rx="3" class="box"/>
<text x="144" y="288" text-anchor="middle" class="t-mono">1</text>
<rect x="230" y="252" width="60" height="60" rx="3" class="box"/>
<rect x="258" y="284" width="22" height="22" class="box-accent"/>
<line x1="300" y1="282" x2="328" y2="282" class="arrow" marker-end="url(#eq-a)"/>
<rect x="338" y="266" width="32" height="32" rx="3" class="box"/>
<text x="354" y="288" text-anchor="middle" class="t-mono">1</text>
<text x="400" y="272" class="t-sm">Take the maximum over a region and it stops</text>
<text x="400" y="290" class="t-sm">mattering where in that region the thing was.</text>
<text x="400" y="312" class="t-sm">Detection survives. Location is discarded.</text>
</svg>
<figcaption>Convolution: the detection moves with the input. Pooling: the output stops caring where it was.</figcaption>
</figure>

**Convolution is equivariant to translation.** The same filter is applied at every position, so a feature is detected wherever it appears — and, crucially, *the location of the detection moves with it*. Slide the cat to the bottom-right and the activation slides to the bottom-right too. The output changes; it changes in the same way the input did. That's what equivariance means: the representation tracks the transformation rather than ignoring it.

**Pooling is invariant to small translations.** Take the maximum over a region and it stops mattering where inside that region the feature was. Nudge the input a couple of pixels and the pooled output is identical. The information about exact position has been deliberately discarded.

So when people say a CNN "doesn't care where the cat is", they're describing pooling, not convolution. Convolution cares a great deal about where things are — it just handles every position identically.

Two things fall out of this that are worth being clear-eyed about.

The first is that this only holds for **translation**. A CNN is not naturally invariant to rotation, scale, or viewpoint. Turn the image upside down and the learned filters simply do not match. There's no architectural magic that fixes it — you either train on rotated examples until the network learns rotated filters too, or you build in the invariance explicitly. The "CNNs are invariant to transformations" shorthand is doing a lot of quiet work that only covers one transformation.

The second is a genuine trade.

## What, at the cost of where

Every pooling operation and every stride throws away spatial precision to gain semantic reach. Run that all the way through a classification network and the final layers know, with confidence, *what* is in the image — and have almost no idea *where*.

For classification that's exactly right. "Cat" is the answer; the coordinates were never wanted.

But plenty of tasks need the location back. Object detection has to draw a box. Segmentation has to label every individual pixel. Both need the spatial detail that the downsampling path deliberately destroyed, which is why those architectures can't just be a classifier with a different head — they need a way back up to full resolution.

That's what **transposed convolution** and **unpooling** are for: operations that increase resolution rather than reduce it, running the downsampling in reverse. I'm going to be honest and say I don't understand the mechanics of either well enough to explain them properly yet, so I'll leave them named rather than half-described, and come back to them.

The shape of the problem is clear even without the details, though. A CNN gains its understanding by progressively discarding location, and any task that needs location has to spend real architectural effort getting it back.

## Sources

- [MIT 6.S191: Introduction to Deep Learning](http://introtodeeplearning.com/) — Alexander Amini and Ava Amini. These notes came from the lectures.
- [Lecture videos](https://www.youtube.com/playlist?list=PLtBw6njQRU-rwp5__7C0oIVt26ZgjG9NI)

Diagrams are my own.

