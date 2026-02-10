# CRISP Content Engine — Docs Authoring

Docs live inside the app at `/docs` and are authored as **filesystem-based MDX**.

## Folder structure

- Docs content: `content/docs/**`
- Docs routes/layout: `src/app/docs/**`
- Docs components: `src/components/docs/**`
- Docs loader: `src/lib/docs/**`

## Creating a new page

1. Create an MDX file under `content/docs`.
2. Add required frontmatter:

```mdx
---
title: Page title
description: One sentence description for SEO + page intro.
section: Getting Started | Publishing | Content System | Security & Privacy | Integrations | FAQ | Changelog
order: 10
---
```

3. Choose a clean slug:

- `content/docs/getting-started/index.mdx` → `/docs/getting-started`
- `content/docs/publishing/meta.mdx` → `/docs/publishing/meta`

## Page content rules (house style)

Each page should include:

- A short intro paragraph
- A **“Who this page is for”** section
- Clear bullet points
- Constraints and edge cases
- Links to related docs
- No fluff

## Callouts

Use the `Callout` MDX component:

```mdx
<Callout type="note">
This is a note callout.
</Callout>

<Callout type="tip" title="Pro tip">
This is a tip with a custom title.
</Callout>

<Callout type="warning">
This is a warning callout.
</Callout>
```

## Headings + table of contents

- Use `##` and `###` headings.
- These headings automatically appear in the “On this page” table of contents.

## Links

- Prefer **relative links** (e.g. `/docs/publishing/meta`) to keep future domain migration simple.
- Avoid hardcoding domains in content.

