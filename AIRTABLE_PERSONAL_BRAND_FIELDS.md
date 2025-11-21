# Airtable Personal Brand Fields - Updated Structure

## Required New Fields in BrandProfiles Table

### Basic Information
1. **personal_full_name** (Single line text) - *Required*
   - Question: "Full name?"
   - Existing field

2. **personal_job_title** (Single line text) - *Required* ⚠️ NEW
   - Question: "Job title/role*"
   - New field to add

3. **personal_industry** (Single line text) - *Required* ⚠️ NEW
   - Question: "Industry*"
   - New field to add

4. **personal_links** (Single line text) - *Required*
   - Question: "Website*"
   - Previously: `personal_links` (reworded)
   - Existing field (may need to update label)

### Content Strategy
5. **personal_headline** (Long text) - *Required*
   - Question: "Describe yourself in one sentence*"
   - Previously: personal_headline (reworded)
   - Existing field

6. **personal_audience** (Long text) - *Required*
   - Question: "Who is your primary audience?*"
   - Previously: personal_audience (reworded)
   - Existing field

7. **personal_expertise** (Long text) - *Required*
   - Question: "What subjects or themes do you want to post about regularly?*"
   - Previously: personal_expertise (reworded)
   - Existing field

8. **personal_goals** (Long text) - *Required*
   - Question: "What do you want to achieve with your content?*"
   - Previously: personal_goals (reworded)
   - Existing field

### Voice & Tone
9. **personal_voice_traits** (Multiple select) - *Required* ⚠️ UPDATED
   - Question: "What is your Tone & Style?* (Select up to 3)"
   - Options: Optimistic, Warm, Helpful, Inspirational, Confident, Direct, Analytical, Corporate, Calm, Playful, Friendly, Expert-led
   - Previously: Long text field
   - **Action:** Change field type from Long text to Multiple select, add options

10. **personal_tone_avoid** (Multiple select) - *Required* ⚠️ NEW
    - Question: "What tone should we absolutely avoid?* (Select all that apply)"
    - Options: Negative, Critical, Confrontational, Cynical, Judgmental, Sarcastic, Too personal, Too emotional, Too corporate, Too verbose, rants
    - New field to add

11. **personal_risk_tolerance** (Single select) - *Required* ⚠️ NEW
    - Question: "What is your Risk tolerance level? Select one"
    - Options: Low risk (safe, neutral, reputation-protected), Medium risk (balanced, industry-relevant opinions), High risk (strong viewpoints, controversial insights)
    - New field to add

### Content Style
12. **personal_content_style** (Multiple select) - *Required* ⚠️ NEW
    - Question: "Content Style Preference* (Select up to 4)"
    - Options: Story-based posts, Tactical how-to posts, Thought leadership, Short punchy posts, Case studies, Listicals, Analogy / metaphor style, Principle-based posts (rules, lessons, frameworks), Founder/leader insights, Soft Corporate Tone, Data-driven Content, Conversational tone, Statistic based
    - New field to add

13. **personal_exclude_keywords** (Single line text) - *Optional* ⚠️ NEW
    - Question: "Words, phrases your themes you want to avoid? (optional)"
    - New field to add

### Personal Story
14. **personal_story** (Long text) - *Required*
    - Question: "What particular experiences or achievements would you like to highlight or center the content around ie. what's your personal story"
    - Previously: personal_story (reworded)
    - Existing field

### Assets & Settings
15. **personal_assets_urls** (Multiple attachments or Multiple URLs) - *Optional*
    - Question: "Upload a profile photo, your CV or other assets (optional)"
    - Existing field

16. **timezone** (Single select) - *Required*
    - Question: "Timezone*"
    - Existing field

17. **preferred_image_source** (Single select) - *Required*
    - Question: "Preferred Image Source*"
    - Existing field

18. **language_region** (Single select) - *Required*
    - Question: "Language / Region"
    - Existing field

19. **platforms_requested** (Multiple select) - *Required*
    - Question: "Platforms (select the channels you wish to publish to)*"
    - Existing field

## Summary of Changes

### New Fields to Add (5):
1. `personal_job_title` - Single line text
2. `personal_industry` - Single line text
3. `personal_tone_avoid` - Multiple select
4. `personal_risk_tolerance` - Single select
5. `personal_content_style` - Multiple select
6. `personal_exclude_keywords` - Single line text (optional)

### Fields to Update (1):
1. `personal_voice_traits` - Change from Long text to Multiple select, add options

### Fields to Keep (Existing):
- `personal_full_name`
- `personal_links` (reworded question)
- `personal_headline` (reworded question)
- `personal_audience` (reworded question)
- `personal_expertise` (reworded question)
- `personal_goals` (reworded question)
- `personal_story` (reworded question)
- `personal_assets_urls`
- `timezone`
- `preferred_image_source`
- `language_region`
- `platforms_requested`

## Field Options Configuration

### personal_voice_traits (Multiple select - max 3):
- Optimistic
- Warm
- Helpful
- Inspirational
- Confident
- Direct
- Analytical
- Corporate
- Calm
- Playful
- Friendly
- Expert-led

### personal_tone_avoid (Multiple select - all that apply):
- Negative
- Critical
- Confrontational
- Cynical
- Judgmental
- Sarcastic
- Too personal
- Too emotional
- Too corporate
- Too verbose
- rants

### personal_risk_tolerance (Single select):
- Low risk (safe, neutral, reputation-protected)
- Medium risk (balanced, industry-relevant opinions)
- High risk (strong viewpoints, controversial insights)

### personal_content_style (Multiple select - max 4):
- Story-based posts
- Tactical how-to posts
- Thought leadership
- Short punchy posts
- Case studies
- Listicals
- Analogy / metaphor style
- Principle-based posts (rules, lessons, frameworks)
- Founder/leader insights
- Soft Corporate Tone
- Data-driven Content
- Conversational tone
- Statistic based

