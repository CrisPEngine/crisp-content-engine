# Strategy Webhook Test Payload

This document provides test payloads for the strategy webhook at `https://hook.eu2.make.com/8c33utbuhdfu4j4clmdfeogg2ugzw89m`.

## Payload Structure

The strategy webhook now receives the following payload structure:

```json
{
  "mode": "initial",
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "airtable_table": "BrandProfiles",
  "user_id": "uuid-here",
  "brand_type": "personal" | "company",
  "brand": {
    "name": "Brand Name",
    "website": "https://example.com",
    "timezone": "America/New_York",
    "language_region": "en-US",
    "voice_rules": "Professional yet approachable",
    "brand_keywords": ["keyword1", "keyword2"],
    "exclude_keywords": ["exclude1", "exclude2"],
    "content_rules": "Content guidelines here",
    "brand_palette": "Color palette description",
    "preferred_image_source": "AI Generated",
    "approval_contact_email": "approver@example.com"
  },
  "audience": "Target audience description",
  "value_props": "Value propositions",
  "offers": "Current offers",
  "brand_goals": "Brand goals and objectives",
  "platforms_requested": ["LinkedIn", "Blog"],
  "urls_to_scrape": ["https://example.com"],
  "assets": [
    {
      "url": "https://example.com/asset.jpg",
      "type": "image/jpeg"
    }
  ],
  "personal": {
    "personal_full_name": "John Doe",
    "personal_job_title": "Chief Marketing Officer",
    "personal_industry": "Technology",
    "personal_links": "https://johndoe.com",
    "personal_headline": "Digital Marketing Expert | AI Strategist",
    "personal_audience": "Marketing professionals, CMOs, business owners",
    "personal_expertise": "AI and performance marketing, content strategy",
    "personal_goals": "Establish thought leadership, grow audience",
    "personal_voice_traits": ["Confident", "Insightful", "Knowledgeable"],
    "personal_tone_avoid": ["Negative", "Too corporate", "Too verbose"],
    "personal_risk_tolerance": "Medium risk (balanced, industry-relevant opinions)",
    "personal_content_style": ["Thought leadership", "Tactical how-to posts", "Data-driven Content"],
    "personal_exclude_keywords": "spam, clickbait, jargon",
    "personal_story": "10+ years in digital marketing, helped 50+ companies",
    "personal_assets_urls": ["https://example.com/photo.jpg"]
  } | null,
  "strategy_context": {
    "submitted_at": "2025-11-17T10:05:18.754Z",
    "extra_instructions": "Additional context or instructions"
  },
  "strategy_update_id": null,
  "monthly": null
}
```

## Test Payloads

### 1. Personal Brand Test Payload

```json
{
  "mode": "initial",
  "brand_profile_id": "recTestPersonal123",
  "airtable_table": "BrandProfiles",
  "user_id": "959656d4-b1c2-4d21-bd46-f89f3f41bb0f",
  "brand_type": "personal",
  "brand": {
    "name": "Topher Pascoe",
    "website": "https://topherpascoe.com",
    "timezone": "America/New_York",
    "language_region": "en-US",
    "voice_rules": "Professional, insightful, and approachable with an emphasis on expertise",
    "brand_keywords": ["AI", "digital marketing", "performance marketing", "ROI"],
    "exclude_keywords": ["cheap", "quick fixes", "get rich quick"],
    "content_rules": "Focus on actionable insights, data-driven strategies, and real-world examples",
    "brand_palette": "Modern tech colors: blues and greens",
    "preferred_image_source": "AI Generated",
    "approval_contact_email": "topher@example.com"
  },
  "audience": "Marketing professionals and businesses seeking to leverage AI for growth",
  "value_props": "AI-driven digital marketing strategies that deliver measurable results",
  "offers": "Custom marketing strategies, AI implementation consulting",
  "brand_goals": "Establish thought leadership in AI marketing, grow audience, drive business growth",
  "platforms_requested": ["LinkedIn", "Blog", "X"],
  "urls_to_scrape": ["https://topherpascoe.com", "https://topherpascoe.com/about"],
  "assets": [
    {
      "url": "https://topherpascoe.com/brand-assets/logo.png",
      "type": "image/png"
    }
  ],
  "personal": {
    "personal_full_name": "Topher Pascoe",
    "personal_headline": "Digital Marketing Expert | AI Strategist",
    "personal_expertise": "Specializing in AI-driven digital marketing strategies, performance marketing, and measurable growth outcomes. 10+ years of experience helping businesses scale through data-driven approaches.",
    "personal_audience": "Marketing professionals, CMOs, business owners, and individuals interested in AI and digital marketing transformation",
    "personal_goals": "Establish myself as a leading authority in AI marketing, grow my LinkedIn following to 10K, publish thought leadership content weekly, and attract high-value consulting clients",
    "personal_voice_traits": "Authoritative yet approachable, data-driven, practical, and focused on delivering value. I speak with confidence but avoid jargon without explanation.",
    "personal_story": "Started my career in traditional marketing, transitioned to digital in 2015, and have been at the forefront of AI marketing since 2020. Helped 50+ companies implement AI strategies that increased ROI by an average of 200%.",
    "personal_links": "https://linkedin.com/in/topherpascoe, https://twitter.com/topherpascoe",
    "personal_assets_urls": ["https://topherpascoe.com/photos/headshot.jpg", "https://topherpascoe.com/photos/speaking.jpg"]
  },
  "strategy_context": {
    "submitted_at": "2025-11-17T10:05:18.754Z",
    "extra_instructions": "Focus on establishing thought leadership while maintaining authenticity. Balance educational content with personal insights."
  },
  "strategy_update_id": null,
  "monthly": null
}
```

### 2. Company Brand Test Payload

```json
{
  "mode": "initial",
  "brand_profile_id": "recTestCompany456",
  "airtable_table": "BrandProfiles",
  "user_id": "959656d4-b1c2-4d21-bd46-f89f3f41bb0f",
  "brand_type": "company",
  "brand": {
    "name": "Crisp Digital",
    "website": "https://crispdigital.io",
    "timezone": "America/New_York",
    "language_region": "en-US",
    "voice_rules": "Professional, innovative, and results-focused",
    "brand_keywords": ["digital marketing", "content strategy", "AI automation", "growth marketing"],
    "exclude_keywords": ["cheap", "discount"],
    "content_rules": "Focus on value-driven content, case studies, and industry insights",
    "brand_palette": "Brand colors: #1a1a1a, #8ab4f8, #4ff0b8",
    "preferred_image_source": "AI Generated",
    "approval_contact_email": "approvals@crispdigital.io"
  },
  "audience": "B2B companies looking to scale their digital marketing efforts",
  "value_props": "AI-powered content engine that delivers measurable ROI",
  "offers": "Content strategy services, AI content generation, marketing automation",
  "brand_goals": "Establish market leadership, generate qualified leads, showcase expertise",
  "platforms_requested": ["LinkedIn", "Blog", "X"],
  "urls_to_scrape": ["https://crispdigital.io", "https://crispdigital.io/services"],
  "assets": [
    {
      "url": "https://crispdigital.io/assets/brand-guidelines.pdf",
      "type": "application/pdf"
    },
    {
      "url": "https://crispdigital.io/assets/logo.png",
      "type": "image/png"
    }
  ],
  "personal": null,
  "strategy_context": {
    "submitted_at": "2025-11-17T10:05:18.754Z",
    "extra_instructions": "Emphasize B2B value proposition and thought leadership in AI marketing space"
  },
  "strategy_update_id": null,
  "monthly": null
}
```

## Terminal Commands to Test

### Test Personal Brand Payload

```bash
curl -X POST https://hook.eu2.make.com/8c33utbuhdfu4j4clmdfeogg2ugzw89m \
  -H "Content-Type: application/json" \
  -H "x-make-secret: crisp_engine" \
  -d '{
  "mode": "initial",
  "brand_profile_id": "recTestPersonal123",
  "airtable_table": "BrandProfiles",
  "user_id": "959656d4-b1c2-4d21-bd46-f89f3f41bb0f",
  "brand_type": "personal",
  "brand": {
    "name": "Topher Pascoe",
    "website": "https://topherpascoe.com",
    "timezone": "America/New_York",
    "language_region": "en-US",
    "voice_rules": "Professional, insightful, and approachable with an emphasis on expertise",
    "brand_keywords": ["AI", "digital marketing", "performance marketing", "ROI"],
    "exclude_keywords": ["cheap", "quick fixes", "get rich quick"],
    "content_rules": "Focus on actionable insights, data-driven strategies, and real-world examples",
    "brand_palette": "Modern tech colors: blues and greens",
    "preferred_image_source": "AI Generated",
    "approval_contact_email": "topher@example.com"
  },
  "audience": "Marketing professionals and businesses seeking to leverage AI for growth",
  "value_props": "AI-driven digital marketing strategies that deliver measurable results",
  "offers": "Custom marketing strategies, AI implementation consulting",
  "brand_goals": "Establish thought leadership in AI marketing, grow audience, drive business growth",
  "platforms_requested": ["LinkedIn", "Blog", "X"],
  "urls_to_scrape": ["https://topherpascoe.com", "https://topherpascoe.com/about"],
  "assets": [
    {
      "url": "https://topherpascoe.com/brand-assets/logo.png",
      "type": "image/png"
    }
  ],
  "personal": {
    "personal_full_name": "Topher Pascoe",
    "personal_headline": "Digital Marketing Expert | AI Strategist",
    "personal_expertise": "Specializing in AI-driven digital marketing strategies, performance marketing, and measurable growth outcomes. 10+ years of experience helping businesses scale through data-driven approaches.",
    "personal_audience": "Marketing professionals, CMOs, business owners, and individuals interested in AI and digital marketing transformation",
    "personal_goals": "Establish myself as a leading authority in AI marketing, grow my LinkedIn following to 10K, publish thought leadership content weekly, and attract high-value consulting clients",
    "personal_voice_traits": "Authoritative yet approachable, data-driven, practical, and focused on delivering value. I speak with confidence but avoid jargon without explanation.",
    "personal_story": "Started my career in traditional marketing, transitioned to digital in 2015, and have been at the forefront of AI marketing since 2020. Helped 50+ companies implement AI strategies that increased ROI by an average of 200%.",
    "personal_links": "https://linkedin.com/in/topherpascoe, https://twitter.com/topherpascoe",
    "personal_assets_urls": ["https://topherpascoe.com/photos/headshot.jpg", "https://topherpascoe.com/photos/speaking.jpg"]
  },
  "strategy_context": {
    "submitted_at": "2025-11-17T10:05:18.754Z",
    "extra_instructions": "Focus on establishing thought leadership while maintaining authenticity. Balance educational content with personal insights."
  },
  "strategy_update_id": null,
  "monthly": null
}'
```

### Test Company Brand Payload

```bash
curl -X POST https://hook.eu2.make.com/8c33utbuhdfu4j4clmdfeogg2ugzw89m \
  -H "Content-Type: application/json" \
  -H "x-make-secret: crisp_engine" \
  -d '{
  "mode": "initial",
  "brand_profile_id": "recTestCompany456",
  "airtable_table": "BrandProfiles",
  "user_id": "959656d4-b1c2-4d21-bd46-f89f3f41bb0f",
  "brand_type": "company",
  "brand": {
    "name": "Crisp Digital",
    "website": "https://crispdigital.io",
    "timezone": "America/New_York",
    "language_region": "en-US",
    "voice_rules": "Professional, innovative, and results-focused",
    "brand_keywords": ["digital marketing", "content strategy", "AI automation", "growth marketing"],
    "exclude_keywords": ["cheap", "discount"],
    "content_rules": "Focus on value-driven content, case studies, and industry insights",
    "brand_palette": "Brand colors: #1a1a1a, #8ab4f8, #4ff0b8",
    "preferred_image_source": "AI Generated",
    "approval_contact_email": "approvals@crispdigital.io"
  },
  "audience": "B2B companies looking to scale their digital marketing efforts",
  "value_props": "AI-powered content engine that delivers measurable ROI",
  "offers": "Content strategy services, AI content generation, marketing automation",
  "brand_goals": "Establish market leadership, generate qualified leads, showcase expertise",
  "platforms_requested": ["LinkedIn", "Blog", "X"],
  "urls_to_scrape": ["https://crispdigital.io", "https://crispdigital.io/services"],
  "assets": [
    {
      "url": "https://crispdigital.io/assets/brand-guidelines.pdf",
      "type": "application/pdf"
    },
    {
      "url": "https://crispdigital.io/assets/logo.png",
      "type": "image/png"
    }
  ],
  "personal": null,
  "strategy_context": {
    "submitted_at": "2025-11-17T10:05:18.754Z",
    "extra_instructions": "Emphasize B2B value proposition and thought leadership in AI marketing space"
  },
  "strategy_update_id": null,
  "monthly": null
}'
```

## Using a JSON File (Recommended for Complex Payloads)

### 1. Create a test file:

```bash
# Create personal brand test file
cat > test-personal-payload.json << 'EOF'
{
  "mode": "initial",
  "brand_profile_id": "recTestPersonal123",
  "airtable_table": "BrandProfiles",
  "user_id": "959656d4-b1c2-4d21-bd46-f89f3f41bb0f",
  "brand_type": "personal",
  "brand": {
    "name": "Topher Pascoe",
    "website": "https://topherpascoe.com",
    "timezone": "America/New_York",
    "language_region": "en-US",
    "voice_rules": "Professional, insightful, and approachable with an emphasis on expertise",
    "brand_keywords": ["AI", "digital marketing", "performance marketing", "ROI"],
    "exclude_keywords": ["cheap", "quick fixes", "get rich quick"],
    "content_rules": "Focus on actionable insights, data-driven strategies, and real-world examples",
    "brand_palette": "Modern tech colors: blues and greens",
    "preferred_image_source": "AI Generated",
    "approval_contact_email": "topher@example.com"
  },
  "audience": "Marketing professionals and businesses seeking to leverage AI for growth",
  "value_props": "AI-driven digital marketing strategies that deliver measurable results",
  "offers": "Custom marketing strategies, AI implementation consulting",
  "brand_goals": "Establish thought leadership in AI marketing, grow audience, drive business growth",
  "platforms_requested": ["LinkedIn", "Blog", "X"],
  "urls_to_scrape": ["https://topherpascoe.com", "https://topherpascoe.com/about"],
  "assets": [
    {
      "url": "https://topherpascoe.com/brand-assets/logo.png",
      "type": "image/png"
    }
  ],
  "personal": {
    "personal_full_name": "Topher Pascoe",
    "personal_headline": "Digital Marketing Expert | AI Strategist",
    "personal_expertise": "Specializing in AI-driven digital marketing strategies, performance marketing, and measurable growth outcomes. 10+ years of experience helping businesses scale through data-driven approaches.",
    "personal_audience": "Marketing professionals, CMOs, business owners, and individuals interested in AI and digital marketing transformation",
    "personal_goals": "Establish myself as a leading authority in AI marketing, grow my LinkedIn following to 10K, publish thought leadership content weekly, and attract high-value consulting clients",
    "personal_voice_traits": "Authoritative yet approachable, data-driven, practical, and focused on delivering value. I speak with confidence but avoid jargon without explanation.",
    "personal_story": "Started my career in traditional marketing, transitioned to digital in 2015, and have been at the forefront of AI marketing since 2020. Helped 50+ companies implement AI strategies that increased ROI by an average of 200%.",
    "personal_links": "https://linkedin.com/in/topherpascoe, https://twitter.com/topherpascoe",
    "personal_assets_urls": ["https://topherpascoe.com/photos/headshot.jpg", "https://topherpascoe.com/photos/speaking.jpg"]
  },
  "strategy_context": {
    "submitted_at": "2025-11-17T10:05:18.754Z",
    "extra_instructions": "Focus on establishing thought leadership while maintaining authenticity. Balance educational content with personal insights."
  },
  "strategy_update_id": null,
  "monthly": null
}
EOF
```

### 2. Send the payload:

```bash
curl -X POST https://hook.eu2.make.com/8c33utbuhdfu4j4clmdfeogg2ugzw89m \
  -H "Content-Type: application/json" \
  -H "x-make-secret: crisp_engine" \
  -d @test-personal-payload.json
```

## Key Fields for AI Strategy Crafting

### Personal Brand Fields (when `brand_type: "personal"`)

- **`personal_full_name`**: Full name of the person
- **`personal_job_title`**: Job title/role (e.g., "Chief Marketing Officer")
- **`personal_industry`**: Industry (e.g., "Technology", "Finance", "Healthcare")
- **`personal_links`**: Website URL
- **`personal_headline`**: Describe yourself in one sentence
- **`personal_audience`**: Who is your primary audience?
- **`personal_expertise`**: What subjects or themes do you want to post about regularly?
- **`personal_goals`**: What do you want to achieve with your content?
- **`personal_voice_traits`**: Array of selected tone & style options (up to 3): Optimistic, Warm, Helpful, Inspirational, Confident, Direct, Analytical, Corporate, Calm, Playful, Friendly, Expert-led, Conversational, Witty, Insightful, Knowledgeable, Trustworthy
- **`personal_tone_avoid`**: Array of tones to avoid (all that apply): Negative, Critical, Confrontational, Cynical, Judgmental, Sarcastic, Too personal, Too emotional, Too corporate, Too verbose, rants
- **`personal_risk_tolerance`**: Risk tolerance level (single select): "Low risk (safe, neutral, reputation-protected)", "Medium risk (balanced, industry-relevant opinions)", or "High risk (strong viewpoints, controversial insights)"
- **`personal_content_style`**: Array of content style preferences (up to 4): Story-based posts, Tactical how-to posts, Thought leadership, Short punchy posts, Case studies, Listicals, Analogy / metaphor style, Principle-based posts (rules, lessons, frameworks), Founder/leader insights, Soft Corporate Tone, Data-driven Content, Conversational tone, Statistic based
- **`personal_exclude_keywords`**: Words, phrases, or themes to avoid (optional, single line text)
- **`personal_story`**: What particular experiences or achievements would you like to highlight or center the content around
- **`personal_assets_urls`**: Array of URLs to personal photos/assets (profile photo, CV, etc.)

### Company Brand Fields (when `brand_type: "company"`)

- **`brand.name`**: Company name
- **`brand.website`**: Company website
- **`audience`**: Target audience description
- **`value_props`**: Value propositions
- **`offers`**: Current offers/services
- **`brand_goals`**: Company goals and objectives

### Common Fields (Both Types)

- **`brand_type`**: "personal" or "company" - **Critical for AI to adjust strategy**
- **`brand.voice_rules`**: Voice and tone guidelines
- **`brand.brand_keywords`**: Keywords to include
- **`brand.exclude_keywords`**: Keywords to avoid
- **`platforms_requested`**: Platforms to create content for
- **`urls_to_scrape`**: URLs for AI to analyze
- **`assets`**: Brand assets (logos, images, etc.)

## Notes

1. **`brand_type` is critical**: The AI should use this to determine whether to craft a first-person strategy (personal) or brand-focused strategy (company).

2. **`personal` field**: 
   - Set to `null` for company brands
   - Contains all personal brand details for personal brands

3. **`mode` field**: Always `"initial"` for initial strategy generation (different from monthly updates)

4. **Webhook Secret**: Make sure your Make scenario checks for the `x-make-secret` header with value `crisp_engine` for security.

5. **Response**: The webhook should return `200 OK` with `{"ok": true}` or similar success response.

