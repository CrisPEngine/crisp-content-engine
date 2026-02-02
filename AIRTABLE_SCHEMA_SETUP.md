# Airtable Schema Setup Guide (Multi-Channel)

## Quick Setup Checklist

- [ ] Add 7 new fields to ContentQueue
- [ ] Update `platform` field options
- [ ] Create 7 views
- [ ] Test field creation (create one test record manually)

---

## Step 1: Add New Fields to ContentQueue

Go to ContentQueue table → Click "+" to add field → Configure as follows:

### Field 1: post_type
- **Type:** Single select
- **Options:** 
  - `single` ← Set as default
  - `thread`
  - `caption`
- **Field name:** `post_type`

### Field 2: thread_group_id
- **Type:** Single line text
- **Field name:** `thread_group_id`
- Leave empty for non-thread content

### Field 3: thread_index
- **Type:** Number
- **Format:** Integer
- **Field name:** `thread_index`
- Leave empty for non-thread content

### Field 4: character_count
- **Type:** Formula
- **Formula:** `LEN({post_content})`
- **Field name:** `character_count`
- **Format:** Integer
- This auto-calculates character count from post_content

### Field 5: visual_brief
- **Type:** Long text
- **Field name:** `visual_brief`
- **Enable rich text:** No
- Used for Instagram/Facebook content

### Field 6: generation_job_id
- **Type:** Single line text
- **Field name:** `generation_job_id`
- Used for idempotency tracking

### Field 7: content_item_key
- **Type:** Single line text
- **Field name:** `content_item_key`
- **Important:** This prevents duplicate records on Make retries

---

## Step 2: Update Existing Fields

### Update: platform field
- **Current type:** Single select
- **Action:** Add new options if missing:
  - `X`
  - `Instagram`
  - `Facebook`
  - `Blog`
- **Keep existing:** `LinkedIn` (and any others you have)

### Confirm: hashtags field
- **Type:** Long text
- If this field doesn't exist, create it
- **Field name:** `hashtags`

---

## Step 3: Create Views

Create these 7 views on the ContentQueue table:

### View 1: LinkedIn Approval
- **Filter:**
  ```
  AND(
    {platform}="LinkedIn",
    OR(
      {status}="Needs Approval",
      {status}="Needs Copy",
      {status}="Needs Review",
      {status}="Draft"
    )
  )
  ```
- **Sort:** `created_time` (descending)

### View 2: X Approval
- **Filter:**
  ```
  AND(
    {platform}="X",
    OR(
      {status}="Needs Approval",
      {status}="Needs Copy",
      {status}="Needs Review",
      {status}="Draft"
    )
  )
  ```
- **Sort:** `created_time` (descending), then `thread_index` (ascending)
- **Group:** `thread_group_id` (optional but helpful)

### View 3: Meta Approval
- **Filter:**
  ```
  AND(
    OR(
      {platform}="Instagram",
      {platform}="Facebook"
    ),
    OR(
      {status}="Needs Approval",
      {status}="Needs Copy",
      {status}="Needs Review",
      {status}="Draft"
    )
  )
  ```
- **Sort:** `created_time` (descending)

### View 4: Blog Approval
- **Filter:**
  ```
  AND(
    {platform}="Blog",
    OR(
      {status}="Needs Approval",
      {status}="Needs Copy",
      {status}="Needs Review",
      {status}="Draft"
    )
  )
  ```
- **Sort:** `created_time` (descending)

### View 5: LinkedIn Scheduled
- **Filter:**
  ```
  AND(
    {platform}="LinkedIn",
    OR(
      {status}="Scheduled",
      {status}="Ready To Publish",
      {status}="Published",
      {status}="Failed"
    )
  )
  ```
- **Sort:** `scheduled_time` (ascending)

### View 6: X Scheduled
- **Filter:**
  ```
  AND(
    {platform}="X",
    {post_type}="single",
    OR(
      {status}="Scheduled",
      {status}="Ready To Publish",
      {status}="Published",
      {status}="Failed"
    )
  )
  ```
- **Sort:** `scheduled_time` (ascending)
- **Note:** Only shows `post_type=single` because threads are export-only

### View 7: Meta Scheduled
- **Filter:**
  ```
  AND(
    OR(
      {platform}="Instagram",
      {platform}="Facebook"
    ),
    OR(
      {status}="Scheduled",
      {status}="Ready To Publish",
      {status}="Published",
      {status}="Failed"
    )
  )
  ```
- **Sort:** `scheduled_time` (ascending)

---

## Step 4: Test Field Creation

Create a test record manually with these values:

- `platform`: `X`
- `post_type`: `single`
- `hook`: `Test tweet`
- `post_content`: `This is a test tweet to verify the schema.`
- `status`: `Draft`
- `brand_profile_id`: (link to one of your brands)

**Expected results:**
- `character_count` should auto-calculate to 44
- All other fields should accept values without errors

If successful, delete the test record and proceed to Make.com scenario setup.

---

## Troubleshooting

### "Unknown field name" error in Make.com
- Field names are case-sensitive
- Check spelling exactly: `post_content` (not `post_Content` or `postcontent`)
- Use field names, not field IDs, when referencing in Make

### Formula field not calculating
- Verify formula syntax: `LEN({post_content})`
- Ensure `post_content` field exists
- Formula will show error if field name is wrong

### View filter not working
- Airtable formulas are case-sensitive
- Use double quotes for string values: `"X"` not `'X'`
- Test filter by applying it manually in the UI

---

## After Setup Complete

Run through the testing checklist in `MULTI_CHANNEL_STATUS.md` before deploying to production.
