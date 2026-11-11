# Image generation model audit

Last reviewed for the Quality and Brand Asset Intelligence sprint.

## Current production configuration

| Field | Value |
| --- | --- |
| Provider | OpenAI |
| Generate endpoint | `https://api.openai.com/v1/images/generations` |
| Edit / reference endpoint | `https://api.openai.com/v1/images/edits` |
| Default model | `gpt-image-2.5-flare` |
| Override env | `CCE_IMAGE_MODEL` or `OPENAI_IMAGE_MODEL` |
| Quality used | `medium` |
| Output | JPEG, compression 85 |
| Reference images | Supported via edits endpoint (up to 8 URLs in CCE) |
| Aspect ratios | `1:1`, `16:9`, `1.91:1`, `4:5`, `9:16`, `3:2` mapped to fixed pixel sizes |
| Estimated mid-quality cost | ~$0.05 without references, ~$0.08 with references (planning estimate) |

## Registry (CCE)

Configured in `src/lib/media/imageModels.ts`:

- `gpt-image-2.5-flare` — recommended / current default
- `gpt-image-2.5-sunburst` — available; validate before cutover
- `gpt-image-2.6-flare` — available newer family; higher cost band; validate fidelity
- `gpt-image-1.5` — legacy
- `gpt-image-1` — shutdown; refused by resolver

Production selection is **not** auto-switched. Exact provider + model are recorded on each generated asset and image history entry.

## Comparison notes

| Criterion | 2.5 Flare (current) | 2.5 Sunburst | 2.6 Flare |
| --- | --- | --- | --- |
| Visual quality | Strong mid-tier | Comparable | Potentially stronger; needs A/B |
| Anatomy | Still imperfect; advisory QA required | Similar | Needs validation |
| Prompt adherence | Strong | Strong | Needs validation |
| Reference preservation | Edits API; not pixel-perfect compositing | Same | Needs validation |
| Cost | Mid | Mid | Higher |
| Latency | Acceptable for editorial flow | Similar | Likely higher |

## Known limitations

- OpenAI edits preserve reference style/UI imperfectly; CCE instructs compositing but cannot guarantee pixel-accurate UI. When product screenshots matter, operators should review legibility and reject invented chrome.
- Automated quality assessment is advisory (vision heuristics), not infallible.
- Anatomy defects (hands/faces) remain a model limitation; regeneration is operator-driven with cost estimates.
