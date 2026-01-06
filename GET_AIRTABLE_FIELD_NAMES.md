# How to Get Exact Airtable Field Names

## Critical: Field Names Must Be Exact

Field names in Airtable are **case-sensitive** and must match **exactly** (character-for-character). Even a single character difference will cause the API to return an error.

## Step-by-Step Instructions

### For BrandProfiles Rollup Fields

1. **Open Airtable** → Go to your base
2. **Open BrandProfiles table**
3. **Click "Manage fields"** (top right, gear icon)
4. **Find each field by its Field ID** (shown in the "Field ID" column):
   - `fldoVhwdnORrAzGte` → Copy the **exact** "Name" value
   - `fldlwGSMBUH7OPbjM` → Copy the **exact** "Name" value
   - `fldbmS3KCkSmUw5vn` → Copy the **exact** "Name" value
   - `fldWwrVyniwGMCS7z` → Copy the **exact** "Name" value

5. **Update `src/lib/airtable/field-mapping.ts`**:
   ```typescript
   needs_approval_count: {
     id: 'fldoVhwdnORrAzGte',
     name: 'PASTE_EXACT_NAME_HERE', // ← Replace this
   },
   ```

### For ContentQueue Lookup Fields

1. **Open Airtable** → Go to your base
2. **Open ContentQueue table**
3. **Click "Manage fields"** (top right, gear icon)
4. **Find each field by its Field ID**:
   - `fldDHJ0Rx7Rbzlu4a` → Copy the **exact** "Name" value
   - `fldXszK9zI99mukqB` → Copy the **exact** "Name" value
   - `fldekIgjL6u1GnLbo` → Copy the **exact** "Name" value
   - `fldflM0OxGiaxwVMt` → Copy the **exact** "Name" value
   - `fldA4YS26SIbZd7Xs` → Copy the **exact** "Name" value

5. **Update `src/lib/airtable/field-mapping.ts`** with the exact names

## Quick Reference: Field IDs to Update

### BrandProfiles Rollups
- `fldoVhwdnORrAzGte` → `needs_approval_count` name
- `fldlwGSMBUH7OPbjM` → `ready_to_publish_count` name
- `fldbmS3KCkSmUw5vn` → `scheduled_count` name
- `fldWwrVyniwGMCS7z` → `published_count` name

### ContentQueue Lookups
- `fldDHJ0Rx7Rbzlu4a` → `brand_name_lookup` name
- `fldXszK9zI99mukqB` → `user_id_lookup` name
- `fldekIgjL6u1GnLbo` → `timezone_lookup` name
- `fldflM0OxGiaxwVMt` → `language_region_lookup` name
- `fldA4YS26SIbZd7Xs` → `spelling_variant_lookup` name

## Alternative: Provide Field Names List

If you prefer, you can provide a list like this:

```
BrandProfiles Rollups:
- fldoVhwdnORrAzGte = "Needs Approval Count"
- fldlwGSMBUH7OPbjM = "Ready To Publish Count"
- fldbmS3KCkSmUw5vn = "Scheduled Count"
- fldWwrVyniwGMCS7z = "Published Count"

ContentQueue Lookups:
- fldDHJ0Rx7Rbzlu4a = "Brand Name"
- fldXszK9zI99mukqB = "User ID"
- fldekIgjL6u1GnLbo = "Timezone"
- fldflM0OxGiaxwVMt = "Language Region"
- fldA4YS26SIbZd7Xs = "Spelling Variant"
```

And I'll update the mapping file for you.

## After Updating

1. Save `src/lib/airtable/field-mapping.ts`
2. The app will automatically use the correct field names
3. Test by loading the dashboard - it should work without errors
