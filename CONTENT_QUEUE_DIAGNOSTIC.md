# Content Queue Diagnostic

## Your Question: 3 Records Created, Platform Field Issue

You mentioned these record IDs from Content Queue:
- `recS64omKVywfURMN`
- `recaKGo3Z8Qpg4LyL`
- `recCHTcmx11rPMG4m`

And noted:
1. Only **3 records** were created (expected more?)
2. The **platform** field (`fldY4TjWWgthnDiw4`) seems to come from BrandProfile instead of AI

---

## Why only 3 records?

When you approved the strategy **before** the new code was deployed:

- The app called **`MAKE_CONTENT_GENERATION_WEBHOOK_URL`** (Creator Make scenario).
- **Your account is Scale tier**, so the **multichannel** scenario should have been used, but the old code didn't check the plan.
- The **Creator** Make scenario is designed for Creator tier: **8 LinkedIn + 2 Blog**, but it may have a different implementation or routing that created only 3 records.

Alternatively, if the multichannel scenario **was** run (unlikely with old code), it would have created the count specified in the `channels[]` array sent by the app. The old code (in strategy approve) hard-coded `LinkedIn: 2, Blog: 1` when calling `/api/content/generate`, which totals **3 records**.

---

## Why platform field seems wrong?

The **platform** field in Content Queue should be populated by Make when creating each record. It should **not** link to or pull from BrandProfiles.

### What to check in Airtable:

1. **Content Queue table → platform field:**
   - Field ID: `fldY4TjWWgthnDiw4`
   - Field type: should be **Single Select** (dropdown) or **Single Line Text**.
   - If it's a **Link to BrandProfiles**, that's incorrect. The platform field must be a **Select** or **Text** field, not a link.

2. **BrandProfiles table → platforms_requested field:**
   - This is a **Multi-select** (or text array) that lists the platforms the brand wants to use (e.g. `["LinkedIn", "X"]`).
   - This is **read** by the app and sent to Make in the payload (`brand_voice_context.platforms_requested`), but Make should **not** link the Content Queue `platform` field back to BrandProfiles.

### What to check in Make (multichannel scenario):

When Make creates a Content Queue record, it should map:
- **`platform`** = the platform string from the current item in the loop (e.g. `"LinkedIn"`, `"X"`, `"Blog"`).
- **`brand_profile_id`** = the brand profile record ID (as a **link** to BrandProfiles, not a text field).

If the Make scenario is using the **wrong** field ID or mapping for `platform`, or if Airtable's `platform` field is the wrong type (link instead of select/text), that would cause the platform to appear to come from BrandProfile.

---

## Recommended next steps

1. **In Airtable:**
   - Open Content Queue table.
   - Find the **platform** field (ID `fldY4TjWWgthnDiw4`).
   - Verify it's **Single Select** or **Single Line Text**, **not** a Link to BrandProfiles.
   - If it's a link field, **convert** it to Single Select with options: `LinkedIn`, `X`, `Instagram`, `Facebook`, `Blog`, `Medium`.

2. **In Make (multichannel scenario):**
   - In the "Airtable - Create Record" module for each platform route (LinkedIn, X, etc.):
     - Verify the **platform** field is mapped to the platform name string (e.g. `"LinkedIn"`), not to a BrandProfiles link.
     - Verify **brand_profile_id** is mapped correctly as a link to BrandProfiles (the record ID from the webhook payload).

3. **Test the new flow:**
   - With the new code deployed, go to **Dashboard → Generate Content** (or directly to `/content/generate`).
   - Select the brand and specify how many posts per channel.
   - Click Generate Content and wait.
   - Check Vercel logs for `[Content Generate] Make webhook accepted` and the generation_job_id.
   - Check Make execution history to see if the multichannel scenario ran and created records correctly.
   - Refresh `/content/approval` to see if the new content appears.

---

## Summary: what changed

- **Before:** Strategy approve always called Creator webhook (even for Scale/Growth/Pro users).
- **After:** Strategy approve checks plan:
  - **Creator** → calls Creator Make scenario (same as before).
  - **Growth/Pro/Scale** → redirects to `/content/generate` page where user specifies channel quantities; submitting that form calls the multichannel Make scenario.

This ensures the right scenario runs for each tier and gives non-Creator users control over which channels and how many posts to generate.
