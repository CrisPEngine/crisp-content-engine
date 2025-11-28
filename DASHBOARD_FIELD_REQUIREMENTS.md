# Dashboard Field Requirements

This document outlines the fields that the dashboard expects from Airtable brand profiles and how they're handled.

## Required Fields (with fallbacks)

The dashboard has been updated to handle missing fields gracefully. All fields have fallback values:

### Core Fields
- `id` - Record ID (required, but has fallback: `record.id || ''`)
- `client_name` - Brand name (fallback: `''` or `'Unknown Brand'` if processing fails)
- `status` - Current status (fallback: `''`)
- `created_time` - Creation timestamp (fallback: `''` or `record.createdTime`)

### Optional Fields (with defaults)
- `platforms_requested` - Array of platforms (fallback: `[]`)
- `strategy_summary` - Strategy summary text (fallback: `''`)
- `strategy_payload` - Strategy JSON payload (fallback: `null`)
- `strategy_json` - Alternative field name for strategy (fallback: checks both)
- `strategy_meta` - Strategy metadata (fallback: `null`)
- `brand_type` - Type of brand: 'company' or 'personal' (fallback: `'company'`)

## Potential Issues

### 1. Missing `brand_type` Field
- **Issue**: If `brand_type` is not set in Airtable, it defaults to `'company'`
- **Impact**: Low - only affects filtering if we add brand-type filtering later
- **Fix**: Ensure `brand_type` is set when creating brand profiles

### 2. Missing `status` Field
- **Issue**: If status is missing, onboarding step detection may not work correctly
- **Impact**: Medium - affects onboarding flow
- **Fix**: Ensure status is always set (e.g., 'New Brief', 'Strategy Ready', 'Strategy Approved')

### 3. Missing `platforms_requested` Field
- **Issue**: If not an array, could cause errors
- **Impact**: Low - now handled with `Array.isArray()` check
- **Fix**: Ensure it's always an array in Airtable

### 4. Airtable API Errors
- **Issue**: If Airtable API fails or returns unexpected format
- **Impact**: High - could cause 500 error
- **Fix**: Now wrapped in try-catch with fallback to empty array

### 5. Missing Environment Variables
- **Issue**: If `AIRTABLE_PAT`, `BASE_ID`, or `TABLE_ID` are missing
- **Impact**: Medium - brand profiles won't load
- **Fix**: Dashboard will still load, just without brand profiles

## Error Handling

The dashboard now includes:
1. Try-catch around entire function
2. Try-catch around Airtable fetch
3. Try-catch around individual record processing
4. Fallback values for all fields
5. Error page instead of 500 error

## Debugging

If you're still getting errors, check:
1. Server logs for the specific error message
2. Airtable API response format
3. Whether all required fields exist in Airtable
4. Environment variables are set correctly

## Fields That Should Always Exist

For company brands:
- `client_name` (required in onboarding)
- `status` (set by system)
- `user_id` (required for filtering)
- `brand_type` (should be 'company')

For personal brands:
- All company fields plus:
- `personal_full_name`
- `personal_job_title`
- `personal_industry`
- `personal_links`
- `personal_headline`
- `personal_audience`
- `personal_expertise`
- `personal_goals`
- `personal_story`
- `personal_voice_traits`
- `personal_tone_avoid`
- `personal_risk_tolerance`
- `personal_content_style`

