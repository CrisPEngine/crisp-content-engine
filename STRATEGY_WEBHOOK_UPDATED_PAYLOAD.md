# Strategy Webhook - Updated Payload Structure (2025)

## Webhook URL
`https://hook.eu2.make.com/8c33utbuhdfu4j4clmdfeogg2ugzw89m`

## Complete Updated Payload Structure

### Personal Brand Payload (Full Structure)

```json
{
  "mode": "initial",
  "brand_profile_id": "recTestPersonalUpdated2025",
  "airtable_table": "BrandProfiles",
  "user_id": "959656d4-b1c2-4d21-bd46-f89f3f41bb0f",
  "brand_type": "personal",
  "brand": {
    "name": "Sarah Johnson",
    "website": "https://sarahjohnson.com",
    "timezone": "America/New_York",
    "language_region": "US English",
    "voice_rules": "Professional, insightful, and approachable with an emphasis on expertise",
    "brand_keywords": ["AI", "digital marketing", "performance marketing", "ROI", "growth"],
    "exclude_keywords": ["cheap", "quick fixes", "get rich quick", "spam"],
    "content_rules": "Focus on actionable insights, data-driven strategies, and real-world examples. Avoid jargon without explanation.",
    "brand_palette": "Modern tech colors: blues and greens with accent purple",
    "preferred_image_source": "AI Generated",
    "approval_contact_email": "sarah@example.com"
  },
  "audience": "Marketing professionals, CMOs, business owners, and individuals interested in AI and digital marketing transformation",
  "value_props": "AI-driven digital marketing strategies that deliver measurable results",
  "offers": "Custom marketing strategies, AI implementation consulting, content strategy",
  "brand_goals": "Establish thought leadership in AI marketing, grow audience, drive business growth, build authority",
  "platforms_requested": ["LinkedIn", "Blog"],
  "urls_to_scrape": ["https://sarahjohnson.com", "https://sarahjohnson.com/about", "https://sarahjohnson.com/blog"],
  "assets": [
    {
      "url": "https://sarahjohnson.com/brand-assets/logo.png",
      "type": "image/png"
    },
    {
      "url": "https://sarahjohnson.com/brand-assets/headshot.jpg",
      "type": "image/jpeg"
    }
  ],
  "personal": {
    "personal_full_name": "Sarah Johnson",
    "personal_job_title": "Chief Marketing Officer",
    "personal_industry": "Technology",
    "personal_links": "https://sarahjohnson.com",
    "personal_headline": "CMO | AI Marketing Strategist | Helping businesses scale through data-driven growth",
    "personal_audience": "Marketing professionals, CMOs, business owners, and individuals interested in AI and digital marketing transformation. People who want to leverage AI to improve their marketing ROI.",
    "personal_expertise": "AI-driven digital marketing strategies, performance marketing, content strategy, marketing automation, data analytics, and measurable growth outcomes. 12+ years of experience helping businesses scale through data-driven approaches.",
    "personal_goals": "Establish myself as a leading authority in AI marketing, grow my LinkedIn following to 15K, publish thought leadership content 3x per week, attract high-value consulting clients, and build a personal brand that opens doors to speaking opportunities",
    "personal_voice_traits": ["Confident", "Insightful", "Knowledgeable"],
    "personal_tone_avoid": ["Negative", "Critical", "Too corporate", "Too verbose"],
    "personal_risk_tolerance": "Medium risk (balanced, industry-relevant opinions)",
    "personal_content_style": ["Thought leadership", "Tactical how-to posts", "Data-driven Content", "Case studies"],
    "personal_exclude_keywords": "spam, clickbait, jargon, buzzwords",
    "personal_story": "Started my career in traditional marketing at a Fortune 500 company, transitioned to digital marketing in 2016, and have been at the forefront of AI marketing since 2021. Helped 75+ companies implement AI strategies that increased ROI by an average of 250%. Published 50+ articles on AI marketing, spoken at 15+ industry conferences, and built a team of 20+ marketing professionals.",
    "personal_assets_urls": ["https://sarahjohnson.com/photos/headshot.jpg", "https://sarahjohnson.com/photos/speaking.jpg", "https://sarahjohnson.com/photos/cv.pdf"]
  },
  "strategy_context": {
    "submitted_at": "2025-01-20T12:00:00.000Z",
    "extra_instructions": "Focus on establishing thought leadership while maintaining authenticity. Balance educational content with personal insights. Use data and case studies to support claims. Avoid being too promotional - focus on value delivery."
  },
  "strategy_update_id": null,
  "monthly": null
}
```

## New Personal Brand Fields (Updated 2025)

### Basic Information
- **`personal_full_name`** (string): Full name
- **`personal_job_title`** (string): Job title/role ⚠️ NEW
- **`personal_industry`** (string): Industry ⚠️ NEW
- **`personal_links`** (string): Website URL (reworded from previous field)

### Content Strategy
- **`personal_headline`** (string): Describe yourself in one sentence (reworded)
- **`personal_audience`** (string): Who is your primary audience? (reworded)
- **`personal_expertise`** (string): What subjects or themes do you want to post about regularly? (reworded)
- **`personal_goals`** (string): What do you want to achieve with your content? (reworded)

### Voice & Tone
- **`personal_voice_traits`** (array): Tone & Style - Select up to 3 ⚠️ UPDATED (now array instead of string)
  - Options: Optimistic, Warm, Helpful, Inspirational, Confident, Direct, Analytical, Corporate, Calm, Playful, Friendly, Expert-led, **Conversational**, **Witty**, **Insightful**, **Knowledgeable**, **Trustworthy**
- **`personal_tone_avoid`** (array): Tones to avoid - Select all that apply ⚠️ NEW
  - Options: Negative, Critical, Confrontational, Cynical, Judgmental, Sarcastic, Too personal, Too emotional, Too corporate, Too verbose, rants
- **`personal_risk_tolerance`** (string): Risk tolerance level - Select one ⚠️ NEW
  - Options: "Low risk (safe, neutral, reputation-protected)", "Medium risk (balanced, industry-relevant opinions)", "High risk (strong viewpoints, controversial insights)"

### Content Style
- **`personal_content_style`** (array): Content Style Preference - Select up to 4 ⚠️ NEW
  - Options: Story-based posts, Tactical how-to posts, Thought leadership, Short punchy posts, Case studies, Listicals, Analogy / metaphor style, Principle-based posts (rules, lessons, frameworks), Founder/leader insights, Soft Corporate Tone, Data-driven Content, Conversational tone, Statistic based
- **`personal_exclude_keywords`** (string): Words, phrases, or themes to avoid (optional) ⚠️ NEW

### Personal Story
- **`personal_story`** (string): What particular experiences or achievements would you like to highlight (reworded)

### Assets
- **`personal_assets_urls`** (array): Upload a profile photo, your CV or other assets (optional)

## Test Command

```bash
curl -X POST https://hook.eu2.make.com/8c33utbuhdfu4j4clmdfeogg2ugzw89m \
  -H "Content-Type: application/json" \
  -H "x-make-secret: crisp_engine" \
  -d @test-strategy-webhook-payload.json
```

Or use the test file directly:

```bash
curl -X POST https://hook.eu2.make.com/8c33utbuhdfu4j4clmdfeogg2ugzw89m \
  -H "Content-Type: application/json" \
  -H "x-make-secret: crisp_engine" \
  -d '{
  "mode": "initial",
  "brand_profile_id": "recTestPersonalUpdated2025",
  "airtable_table": "BrandProfiles",
  "user_id": "959656d4-b1c2-4d21-bd46-f89f3f41bb0f",
  "brand_type": "personal",
  "brand": {
    "name": "Sarah Johnson",
    "website": "https://sarahjohnson.com",
    "timezone": "America/New_York",
    "language_region": "US English",
    "voice_rules": "Professional, insightful, and approachable",
    "brand_keywords": ["AI", "digital marketing", "ROI"],
    "exclude_keywords": ["cheap", "spam"],
    "content_rules": "Focus on actionable insights",
    "brand_palette": "Modern tech colors",
    "preferred_image_source": "AI Generated",
    "approval_contact_email": "sarah@example.com"
  },
  "audience": "Marketing professionals and businesses",
  "value_props": "AI-driven digital marketing strategies",
  "offers": "Custom marketing strategies",
  "brand_goals": "Establish thought leadership",
  "platforms_requested": ["LinkedIn", "Blog"],
  "urls_to_scrape": ["https://sarahjohnson.com"],
  "assets": [],
  "personal": {
    "personal_full_name": "Sarah Johnson",
    "personal_job_title": "Chief Marketing Officer",
    "personal_industry": "Technology",
    "personal_links": "https://sarahjohnson.com",
    "personal_headline": "CMO | AI Marketing Strategist",
    "personal_audience": "Marketing professionals, CMOs, business owners",
    "personal_expertise": "AI-driven digital marketing strategies, performance marketing",
    "personal_goals": "Establish thought leadership, grow audience",
    "personal_voice_traits": ["Confident", "Insightful", "Knowledgeable"],
    "personal_tone_avoid": ["Negative", "Too corporate"],
    "personal_risk_tolerance": "Medium risk (balanced, industry-relevant opinions)",
    "personal_content_style": ["Thought leadership", "Tactical how-to posts", "Data-driven Content"],
    "personal_exclude_keywords": "spam, clickbait, jargon",
    "personal_story": "12+ years in digital marketing, helped 75+ companies",
    "personal_assets_urls": []
  },
  "strategy_context": {
    "submitted_at": "2025-01-20T12:00:00.000Z",
    "extra_instructions": "Focus on establishing thought leadership"
  },
  "strategy_update_id": null,
  "monthly": null
}'
```

## Field Type Notes

- **Arrays**: `personal_voice_traits`, `personal_tone_avoid`, `personal_content_style`, `personal_assets_urls` are arrays
- **Strings**: All other personal fields are strings
- **Null**: `personal` field is `null` for company brands

## Response

Expected response: `200 OK` with `{"ok": true}` or similar success message.

