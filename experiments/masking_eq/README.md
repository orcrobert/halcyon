# Masking-aware EQ

Does cutting the less important layer where it buries a more important one
reduce masking in a scene, and at what cost to the layers that are cut?

`baseline` is the mixer before this change: maskers chosen by loudness with a
×1.3 music weight, the maskee trimmed where it was 0–6 dB above the masker's
threshold, cuts below 300 Hz and above 6 kHz written as shelves. `masking` is
the current `auto_eq`: priority from role and A-weighted level at draft mix
volume, the lesser layer cut where the more important one falls within 4 dB of
masking, peaking cuts only, a 1.5 dB per-layer budget, events never protected.

## Method

The metric is independent of the mixer's analysis: 40 ERB bands from 50 Hz to
16 kHz, 64 ms frames, Schroeder spreading with a −6 dB masker index, measured
frame by frame. Layers are ordered by the same priority rule in both runs. For
each layer, the threshold comes only from the layers below it, since that is
what the masking stage claims to fix.

- *masked*: share of a layer's salient energy (within 30 dB of its loudest band
  in that frame) sitting below that threshold.
- *loudness lost*: RMS drop caused by the layer's own EQ.

Volumes are pinned to `assign_volumes` on the un-EQ'd clips in both runs, so
the rows differ only by EQ. Synthetic scenes are four built-in two to four layer
mixes (rain, wind, hum, harmonic pads, birds) at 32 kHz. Stored scenes are the
ready atmospheres of a live instance with at least two loop layers. Events are
excluded from the scene metric.

## Results

### Synthetic (4 scenes, 11 loop layers)

| Metric | baseline | masking |
|---|---|---|
| Priority layer: salient energy masked, no EQ | 0.2% | 0.2% |
| Priority layer: salient energy masked, with EQ | 0.2% | 0.1% |
| Priority layer: median margin over masking, with EQ | +21.8 dB | +22.8 dB |
| Priority layer: loudness lost to its own EQ | 0.57 dB | 0.00 dB |
| Priority layer: scenes where it is cut > 0.5 dB | 50% | 0% |
| Other layers: loudness lost to EQ | 1.54 dB | 0.97 dB |
| Layers above another: masked by those below, no EQ | 0.4% | 0.4% |
| Layers above another: masked by those below, masking cuts only | n/a | 0.5% |
| Layers above another: masked by those below, with EQ | 0.3% | 0.5% |
| Bands per layer | 1.7 | 0.5 |
| Deepest single band | -4.0 dB | -4.5 dB |

### Stored (31 scenes, 103 loop layers)

| Metric | baseline | masking |
|---|---|---|
| Priority layer: salient energy masked, no EQ | 1.4% | 1.4% |
| Priority layer: salient energy masked, with EQ | 1.0% | 1.0% |
| Priority layer: median margin over masking, with EQ | +17.2 dB | +16.9 dB |
| Priority layer: loudness lost to its own EQ | 0.59 dB | 0.31 dB |
| Priority layer: scenes where it is cut > 0.5 dB | 26% | 16% |
| Other layers: loudness lost to EQ | 3.00 dB | 2.41 dB |
| Layers above another: masked by those below, no EQ | 2.4% | 2.4% |
| Layers above another: masked by those below, masking cuts only | n/a | 2.2% |
| Layers above another: masked by those below, with EQ | 2.0% | 2.0% |
| Bands per layer | 2.4 | 1.2 |
| Deepest single band | -9.0 dB | -6.0 dB |

## Reading it

Masking that a static EQ can fix is rare in generated scenes: the priority
layer has 1.4 % of its salient energy masked by the layers under it before any
EQ, because the volume stage already spreads layers over 18 dB. Both versions
bring masking by lower layers from 2.4 % to 2.0 %, so the gain is in cost, not
coverage. The priority layer is touched in 16 % of scenes instead of 26 % (what
remains is tonal rumble and air shelves), the other layers lose 0.6 dB less,
they carry half as many bands, and the deepest cut is −6 dB instead of −9.

Where two layers overlap across the whole body of the lesser one, the budget
scales the cut down, because clearing it would just be turning the layer down.
That case belongs to the volume stage. When a collision is deeper than 12 dB the
masking stage leaves it alone for the same reason.

## Running it

```
docker cp app-halcyon-1:/data/halcyon.db corpus/halcyon.db
docker cp app-halcyon-1:/data/audio corpus/audio
python experiments/masking_eq/export.py --db corpus/halcyon.db --out corpus/scenes.json
python experiments/masking_eq/run.py --name masking --scenes corpus/scenes.json
python experiments/masking_eq/compare.py baseline masking
```

Stop the container, or checkpoint its WAL, before copying the database, or the
newest scenes are missing. Without `--scenes` only the synthetic set runs. To
regenerate `baseline`, check out the mixer from before this change and run with
`--name baseline`.
