# Airtable Formula for Displaying result_payload as Clean Text

## Overview
The `result_payload` field (field ID: `flddd613pjtMNXs0h`) contains JSON data. This document provides Airtable formulas to extract and display it as readable text.

## Option 1: Simple Text Cleanup (Basic)
This formula removes JSON syntax and makes it more readable:

```
SUBSTITUTE(
  SUBSTITUTE(
    SUBSTITUTE(
      SUBSTITUTE(
        SUBSTITUTE(
          SUBSTITUTE(
            SUBSTITUTE(
              {result_payload},
              '""', '"'
            ),
            '": "', ': '
          ),
          '", "', ', '
        ),
        '",', ''
      ),
      '{', ''
    ),
    '}', ''
  ),
  '\n', CHAR(10)
)
```

## Option 2: Extract Objective (Recommended)
Extract just the objective from the monthly_strategy:

```
IF(
  FIND('"objective"', {result_payload}) > 0,
  MID(
    {result_payload},
    FIND('"objective": "', {result_payload}) + LEN('"objective": "'),
    FIND('"', MID({result_payload}, FIND('"objective": "', {result_payload}) + LEN('"objective": "'), 200)) - 1
  ),
  ""
)
```

## Option 3: Extract Core Messaging
Extract the core_messaging:

```
IF(
  FIND('"core_messaging"', {result_payload}) > 0,
  MID(
    {result_payload},
    FIND('"core_messaging": "', {result_payload}) + LEN('"core_messaging": "'),
    FIND('"', MID({result_payload}, FIND('"core_messaging": "', {result_payload}) + LEN('"core_messaging": "'), 500)) - 1
  ),
  ""
)
```

## Option 4: Comprehensive Display (Multi-line)
Create a formula field that displays key information:

```
IF(
  {result_payload},
  "Objective: " & 
  IF(
    FIND('"objective"', {result_payload}) > 0,
    MID(
      {result_payload},
      FIND('"objective": "', {result_payload}) + LEN('"objective": "'),
      FIND('"', MID({result_payload}, FIND('"objective": "', {result_payload}) + LEN('"objective": "'), 200)) - 1
    ),
    "Not specified"
  ) & 
  CHAR(10) & CHAR(10) &
  "Core Messaging: " &
  IF(
    FIND('"core_messaging"', {result_payload}) > 0,
    MID(
      {result_payload},
      FIND('"core_messaging": "', {result_payload}) + LEN('"core_messaging": "'),
      FIND('"', MID({result_payload}, FIND('"core_messaging": "', {result_payload}) + LEN('"core_messaging": "'), 500)) - 1
    ),
    "Not specified"
  ),
  ""
)
```

## Option 5: Display in UI (Recommended Approach)
Instead of using Airtable formulas, the API now provides a `result_payload_formatted` field that contains a clean, readable version of the JSON. This is the recommended approach as it:
- Handles complex JSON parsing correctly
- Formats pillars, themes, and other nested data
- Is easier to maintain and update
- Works consistently across all records

The formatted version includes:
- Objective
- Themes (comma-separated)
- Core Messaging
- Content Pillars (numbered list with descriptions)

## How to Use in Airtable

1. **Create a new Formula field** in the StrategyUpdates table
2. **Name it** `result_payload_display` or similar
3. **Set the field type** to "Long text" (formula fields can be long text)
4. **Paste one of the formulas above** (Option 4 is recommended for comprehensive display)
5. **Save the field**

## Notes

- Airtable formulas have limitations with complex JSON parsing
- For nested arrays (like pillars), the formulas become very complex
- The API approach (`result_payload_formatted`) is more reliable and maintainable
- If you need to display this in the UI, use the `result_payload_formatted` field from the API response

