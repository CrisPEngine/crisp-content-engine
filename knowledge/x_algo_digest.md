# X (Twitter) Algorithm Digest

**Version:** 2026-01-21

## Purpose

This digest summarizes X's public ranking algorithm to guide content generation. The algorithm prioritizes engagement signals, recency, and author reputation.

**Note:** This markdown file is for human reference only. The actual digest constant used in generation is in `src/lib/channels/x-algo-digest.ts`.

---

## Ranking Factors (Priority Order)

1. **Engagement signals matter most**: replies, retweets, likes (in that order)
2. **Recency is critical**: fresh content ranks higher
3. **Author reputation**: blue check, follower count, and engagement history boost visibility
4. **Negative signals**: blocks, mutes, reports, "show less" actions hurt reach
5. **External links slightly reduce in-feed visibility** (but still valuable)
6. **Media** (images, videos) increase engagement when relevant
7. **Threads keep users on-platform longer** (positive signal)
8. **Reply quality > reply quantity**: substantive replies rank higher
9. **Avoid spam patterns**: repetitive text, excessive hashtags, bot-like behavior
10. **First hour performance predicts long-term reach**
11. **Authentic voice and controversial takes drive replies**
12. **Hook in first line determines scroll-stop rate**
13. **Line breaks and whitespace improve readability and engagement**
14. **Questions and strong opinions generate more replies** than neutral statements
15. **Timing matters**: post when your audience is active

---

## Content Guidelines

### Do:
- ✓ Hook in the first line (first 140 chars decide whether users engage)
- ✓ Use line breaks for skimmability
- ✓ Be opinionated and clear
- ✓ Ask questions or make bold claims to drive replies
- ✓ Keep tweets focused on one idea

### Don't:
- ✗ Use LinkedIn-style formal language ("I'm excited to announce", "Here's what I learned")
- ✗ Write wall-of-text paragraphs
- ✗ Overuse hashtags (1–2 max, often zero)
- ✗ Be vague or neutral (takes no position = no engagement)
- ✗ Ignore the 280 character limit

---

## Update Policy

- Only update this digest when you intentionally want output behavior to shift
- Keep digest concise (<1,500 tokens when formatted for prompts)
- Human-review all changes
- Update the version date when making changes

---

## Sources

- X's public ranking algorithm documentation
- Content creator best practices
- Engagement pattern analysis

---

Last updated: 2026-01-21
