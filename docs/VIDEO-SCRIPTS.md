# Runway video scripts — Imortek

Everything here is written to be pasted straight into Runway. Each shot gives you the
prompt, the duration, the aspect ratio, and where the finished file goes in this repo.

**The site works without any of these.** Every slot falls back to the animated canvas or a
static panel if the file is absent, so you can add them one at a time, in any order, and
nothing breaks in between.

---

## 1. Before you generate anything: the size budget

GitHub and GitHub Pages impose real limits, and video is the one thing on a site like this
that can blow through them.

| Limit | Value | What happens if you exceed it |
|---|---|---|
| Single file, hard block | **100 MB** | `git push` is rejected outright |
| Single file, warning | **50 MB** | Push succeeds, GitHub warns you |
| GitHub Pages site total | **1 GB** | Publishing fails |
| Pages bandwidth, soft | **100 GB/month** | GitHub may throttle or contact you |

**The budget for this site: keep every clip under 4 MB, and the whole `assets/video/`
directory under 25 MB.** That is not a technical limit, it is a "the page should load on a
phone on mobile data" limit, and it matters more than the GitHub one.

A 6-second 1280×720 clip of abstract motion encodes to roughly 1.5–3 MB at the settings
below. That is fine. A 10-second 4K clip straight out of Runway is 40–80 MB. That is not.

### Always re-encode before committing

Runway's export is high-bitrate. Do not commit it directly. Run both of these:

```bash
# H.264 MP4 — the compatibility baseline, plays everywhere
ffmpeg -i runway-export.mp4 \
  -vf "scale=1280:-2,fps=24" \
  -c:v libx264 -preset slow -crf 30 \
  -pix_fmt yuv420p -movflags +faststart \
  -an \
  assets/video/hero.mp4

# WebM VP9 — usually 30-40% smaller, served first to browsers that take it
ffmpeg -i runway-export.mp4 \
  -vf "scale=1280:-2,fps=24" \
  -c:v libvpx-vp9 -crf 38 -b:v 0 -row-mt 1 \
  -an \
  assets/video/hero.webm

# Poster frame — shown while the video loads, and to anyone who blocks video
ffmpeg -i assets/video/hero.mp4 -vf "select=eq(n\,12)" -vframes 1 -q:v 3 \
  assets/img/video/hero.jpg
```

Notes on those flags:

- `-an` strips audio. Every clip on this site is silent and autoplays muted; audio would
  only add bytes and get muted anyway.
- `-crf 30` for H.264 and `-crf 38` for VP9 are aggressive. On abstract, dark, softly-lit
  motion they are close to invisible. On faces or fine text they would not be — which is
  part of why none of the shots below contain either.
- `-movflags +faststart` moves the index to the front of the file so playback can begin
  before the whole thing downloads.
- `fps=24` — these are ambient background loops. Nobody needs 60.

Check the result before committing:

```bash
ls -lh assets/video/          # every file under 4 MB?
du -sh assets/video/          # directory under 25 MB?
```

**If a clip will not come under 4 MB and you still want it**, do not commit it to the repo.
Host it externally and point the slot at the URL — the slot accepts a full URL as happily as
a local path. Git LFS is not a good answer here: GitHub Pages serves LFS pointer files as
plain text rather than resolving them, so the video simply will not play.

---

## 2. House style — apply to every prompt

Paste this into the end of any prompt that needs grounding:

> dark near-black background, deep teal and violet accents, high contrast, soft volumetric
> glow, cinematic, shallow depth of field, slow deliberate motion, no text, no people, no
> logos, no watermarks, 24fps, subtle film grain

Colour targets, if Runway will take hex or you are grading afterwards:

| Role | Hex | Where it appears on the site |
|---|---|---|
| Ground | `#06080b` | Page background |
| Panel | `#0f151c` | Cards |
| Teal | `#5eead4` | Primary accent |
| Violet | `#a78bfa` | Secondary accent |
| Amber | `#fbbf24` | Kickstarter / funding only |

**Things to keep out of every shot**, because they will make the site look worse or make a
claim it cannot back:

- Any legible text or code. Generative text renders as convincing gibberish and undermines
  a site whose entire pitch is that it does not overstate.
- Human faces or hands. This is a one-person practice; stock-looking people read as fake.
- Recognisable brands, logos, or anything resembling a real company's UI.
- Anything implying scale that does not exist — datacentre rows, teams at desks, trading
  floors.
- Fast cuts or aggressive camera moves. These sit behind text and under a
  `prefers-reduced-motion` rule; they should be nearly still.

---

## 3. Shot list

### Shot 1 — Homepage hero *(highest priority)*

- **File:** `assets/video/hero.mp4` + `.webm`
- **Slot:** homepage hero, sits behind the headline
- **Duration:** 8s, seamless loop
- **Aspect:** 16:9, export 1280×720
- **Replaces:** the animated capability-lattice canvas

> A slowly rotating three-dimensional lattice of glowing nodes connected by thin luminous
> filaments, suspended in deep black space. Most nodes glow soft teal; a scattered few pulse
> violet and are ringed by faint concentric halos. A pale scanning plane sweeps slowly from
> left to right across the structure, brightening each connection as it passes and letting it
> fade behind. The camera drifts almost imperceptibly forward. Dark near-black background,
> deep teal and violet accents, high contrast, soft volumetric glow, cinematic, shallow depth
> of field, slow deliberate motion, no text, no people, no logos, 24fps, subtle film grain.

*Loop tip:* generate 10s, then trim to the 8s window that matches best at the seam. Or
cross-fade the last 0.5s over the first with
`ffmpeg -i in.mp4 -filter_complex "[0]split[a][b];[a]trim=0:7.5[a];[b]trim=7.5:8,fade=t=in:st=7.5:d=0.5[b];[a][b]concat" out.mp4`.

---

### Shot 2 — ParanoidBSD

- **File:** `assets/video/pbsd.mp4` + `.webm`
- **Slot:** PBSD page hero
- **Duration:** 6s, loop
- **Aspect:** 16:9, 1280×720

> A dense wall of interlocking dark hexagonal armour plates, each edge outlined in a thin
> amber filament. A single plate near the centre rotates open like an iris to reveal a
> brilliant teal geometric core suspended inside, then closes again. Everything else stays
> perfectly still. Extremely shallow depth of field, the background plates falling out of
> focus. Dark near-black, amber and teal accents, soft volumetric glow, cinematic, slow
> deliberate motion, no text, no people, no logos, 24fps.

*Why this shot:* the iris opening once and closing is the capability model — one specific
thing is reachable, everything else stays sealed. It reads correctly even if a viewer never
gets to the explanation.

---

### Shot 3 — Cypha

- **File:** `assets/video/cypha.mp4` + `.webm`
- **Duration:** 6s, loop
- **Aspect:** 16:9, 1280×720

> A cloud of thousands of tiny luminous particles drifting in black space, initially
> disordered. They gradually organise themselves into three distinct softly-glowing clusters —
> one teal, one violet, one amber — with faint curved boundary surfaces forming in the space
> between them. The camera orbits very slowly around the arrangement. Dark near-black
> background, high contrast, soft volumetric glow, shallow depth of field, cinematic, slow
> deliberate motion, no text, no people, no logos, 24fps, subtle film grain.

---

### Shot 4 — RetDec Imortek

- **File:** `assets/video/retdec.mp4` + `.webm`
- **Duration:** 6s, loop
- **Aspect:** 16:9, 1280×720

> Abstract rectangular blocks of glowing blue-white noise, tightly packed like a wall of
> static, slowly resolving into ordered geometric structure — the chaotic blocks aligning into
> clean parallel bands, then into a single luminous crystalline lattice. Rising motion
> throughout, as though structure is precipitating out of noise. Dark near-black background,
> blue and teal accents, high contrast, soft glow, cinematic, slow deliberate motion, no
> readable text, no letters, no numbers, no people, no logos, 24fps.

*Important:* say "no readable text, no letters, no numbers" explicitly here. Prompts about
decompilation pull hard toward rendering fake code, and fake code on this page would be
actively embarrassing.

---

### Shot 5 — MathScript

- **File:** `assets/video/mathscript.mp4` + `.webm`
- **Duration:** 6s, loop
- **Aspect:** 16:9, 1280×720

> A luminous violet curved surface, like a smooth mathematical manifold, undulating gently in
> black space. A grid of fine teal contour lines flows across it, deforming with the surface.
> Thin glowing tangent planes flicker into existence at points along the curve and fade away.
> Elegant, precise, restrained. Dark near-black background, violet and teal accents, soft
> volumetric glow, cinematic, very slow motion, no text, no numbers, no people, no logos, 24fps.

---

### Shot 6 — AEGIS

- **File:** `assets/video/aegis.mp4` + `.webm`
- **Duration:** 8s, loop
- **Aspect:** 16:9, 1280×720

> Bright discrete pulses of teal light travelling along a network of thin filaments between
> glowing nodes in black space — clearly traceable, each pulse followable from source to
> destination. Halfway through, a uniform violet wash floods every filament at a constant
> steady rate, and the individual pulses become completely indistinguishable within it, the
> whole network settling into a flat unchanging glow. Dark near-black background, teal and
> violet, high contrast, soft volumetric glow, cinematic, slow deliberate motion, no text, no
> people, no logos, 24fps.

*Why this shot:* the transition from traceable pulses to a flat wall is exactly the claim the
product makes, and exactly what the interactive demo on that page measures. Worth the extra
2 seconds.

---

### Shot 7 — SENTINEL

- **File:** `assets/video/sentinel.mp4` + `.webm`
- **Duration:** 6s, loop
- **Aspect:** 16:9, 1280×720

> An abstract dark topographic surface seen from above, like an unlabelled map rendered in
> thin glowing contour lines. Smooth heat-like blooms of teal and amber rise slowly from
> beneath the surface at scattered points, swelling and overlapping into soft density fields.
> A slow downward camera push. Dark near-black background, teal and amber accents, soft
> volumetric glow, cinematic, slow deliberate motion, no text, no place names, no people, no
> logos, 24fps.

*Keep it abstract.* No recognisable city, no street layout, nothing that reads as a real
place. This is analytical software about crime and a recognisable location would imply a
claim about somewhere real.

---

### Shot 8 — Cell AI

- **File:** `assets/video/cellai.mp4` + `.webm`
- **Duration:** 8s, loop
- **Aspect:** 16:9, 1280×720

> A macro view of a living reaction-diffusion pattern spreading across a dark surface —
> organic teal and violet forms budding, dividing and merging in the manner of a Turing
> pattern or a coral colony growing in fast motion. Continuous slow growth outward from the
> centre. Dark near-black background, teal and violet, soft volumetric glow, extreme macro
> lens, shallow depth of field, cinematic, no text, no people, no logos, 24fps, subtle film grain.

*This one has a reference:* the live simulation already running on the Cell AI page produces
exactly this. Screenshot it and use image-to-video for a much closer match than text alone.

---

### Shot 9 — Kickstarter

- **File:** `assets/video/kickstarter.mp4` + `.webm`
- **Duration:** 6s, loop
- **Aspect:** 16:9, 1280×720

> A dark architectural lattice of thin amber filaments assembling itself piece by piece in
> black space, building steadily upward from a foundation, each new element locking into place
> with a soft pulse of light. The structure is clearly incomplete at the top, still under
> construction when the shot ends. Slow upward camera drift. Dark near-black background, amber
> and teal accents, soft volumetric glow, cinematic, slow deliberate motion, no text, no
> people, no logos, 24fps.

*The structure must stay visibly unfinished.* The campaign is asking for help to complete
something. A finished building contradicts the ask.

---

### Shot 10 — Social / vertical cut *(optional)*

- **File:** `assets/video/social-vertical.mp4`
- **Duration:** 10s
- **Aspect:** 9:16, 1080×1920
- **Use:** Kickstarter campaign page, Instagram, TikTok — **not committed to this repo**

Same content as Shot 1, reframed vertically with the lattice filling the upper two-thirds and
clean empty space in the lower third for a caption overlay. Keep this one out of
`assets/video/`; upload it directly to whichever platform needs it.

---

## 4. Dropping a file in

Once a clip is encoded and under budget, put it at the path named in its shot and commit.
Nothing else is required — the slot detects the file and switches over on the next load.

```bash
ls -lh assets/video/hero.mp4     # confirm size
./tools/build.sh                  # regenerates assets/video/manifest.json
git add assets/video/ assets/img/video/hero.jpg
git commit -m "Add hero background video"
git push -u origin claude/portfolio-website-setup-yfwqzs
```

**You must run `./tools/build.sh` after adding a clip.** The builder writes
`assets/video/manifest.json` from whatever `.mp4` files are sitting in `assets/video/`, and
the site only requests clips named in that manifest. This is deliberate: it means a site
with no videos issues no requests for videos, rather than firing a 404 per page.

The mechanism, in short:

1. On load the page fetches `assets/video/manifest.json` — one small request that always
   succeeds.
2. For each hero slot, if its name is in the manifest, a muted, looping, `playsinline`
   `<video>` is created; otherwise nothing happens and the canvas animation keeps running.
3. When the video can play, it fades in over the canvas and the canvas animation stops to
   save battery.
4. If the visitor has `prefers-reduced-motion` set, no video is requested at all and the
   poster image is used instead.

That last point matters: these are decorative background loops, and a visitor who has asked
their operating system for less motion should not be served an autoplaying video regardless
of how tasteful it is.

## 5. A note on honesty

The rest of this site is careful not to imply capability it cannot demonstrate. Video is the
easiest place to break that rule by accident — a shot of a bustling operations centre would
imply a team, a shot of a finished OS booting would imply a product that does not exist yet.

Every prompt above is abstract for that reason. They illustrate ideas rather than assert
facts, which keeps them consistent with the claims ledger on every research page and the
"planning estimates" labelling on the funding model.
