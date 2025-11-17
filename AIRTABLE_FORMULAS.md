# Airtable Formulas for Strategy Display

## Human-Readable Strategy Summary Formula

If you want to create a formula field in Airtable that extracts a human-readable summary from the `strategy_json` field, you can use this formula:

### Option 1: Simple Extraction (Basic Info)

```
IF(
  {strategy_json},
  "📌 " & 
  REGEX_EXTRACT({strategy_json}, '"one_liner":\s*"([^"]+)"') & 
  "\n\n" &
  REGEX_EXTRACT({strategy_json}, '"positioning":\s*"([^"]+)"') & 
  "\n\n## Brand Understanding\n" &
  REGEX_EXTRACT({strategy_json}, '"summary":\s*"([^"]+)"', 1) &
  "\n\n**Target Audience:** " &
  REGEX_EXTRACT({strategy_json}, '"perceived_audience":\s*"([^"]+)"') &
  "\n\n**Tone:** " &
  REGEX_EXTRACT({strategy_json}, '"tone_description":\s*"([^"]+)"'),
  ""
)
```

**Note:** Airtable's REGEX_EXTRACT has limitations with nested JSON. The webhook now automatically generates and stores this in `strategy_summary`, so you don't need this formula.

## Recommended Approach

**Use the `strategy_summary` field** that the webhook automatically populates. The webhook extracts key information from the JSON and formats it as a human-readable summary.

The webhook generates summaries that include:
- Brand one-liner and positioning
- Brand understanding and target audience
- Content pillars
- Posting schedule/cadence
- Content mix percentages
- Voice guidelines (dos and don'ts)
- Key performance indicators

## Field Setup

1. **`strategy_json`** - Long text field (stores the full JSON)
2. **`strategy_summary`** - Long text field (stores the human-readable summary - auto-populated by webhook)

The app will automatically display `strategy_summary` if available, falling back to formatted JSON if not.

