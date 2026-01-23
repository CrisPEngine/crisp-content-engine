# PreviewLeads Airtable Table Schema

## Table Name
`PreviewLeads` (or value of `AIRTABLE_PREVIEW_LEADS_TABLE` env var)

## Required Fields

| Field Name | Type | Description |
|------------|------|-------------|
| `email` | Email | User's email address (required, used for de-duplication) |
| `preview_session_id` | Single line text | Preview session ID from Supabase (required, used for de-duplication) |
| `persona` | Single line text | Selected persona (Founder, Consultant, Agency, etc.) |
| `topics` | Long text | JSON string of selected topics |
| `tone` | Single line text | Selected tone (Direct, Thoughtful, Bold, Practical) |
| `goal` | Single line text | Selected goal (Awareness, Leads, Trust, Sales) |
| `utm_source` | Single line text | UTM source parameter |
| `utm_campaign` | Single line text | UTM campaign parameter |
| `channel` | Single line text | Selected channel (LinkedIn, X, Instagram) |
| `converted_at` | Date | Timestamp when lead was captured |

## De-duplication Logic

The endpoint searches for existing records using:
```
AND({email} = "user@example.com", {preview_session_id} = "session-id")
```

If found, updates the existing record. Otherwise, creates a new record.

## Environment Variable

Add to Vercel:
- `AIRTABLE_PREVIEW_LEADS_TABLE` = `PreviewLeads` (or your table name/ID)

## Notes

- Email and preview_session_id together form a unique constraint (handled in code, not Airtable)
- All fields except `email` and `preview_session_id` are optional
- `converted_at` is automatically set to current timestamp
