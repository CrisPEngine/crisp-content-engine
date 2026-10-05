# Legacy brand activation

Use this when an Airtable BrandProfile should become a native CCE brand. Do not bulk-migrate a base.

1. List every BrandProfile with the same client name and the same owner. Stop if any same-name record belongs to a different CCE user.
2. Pick one canonical record explicitly. Keep the others. Do not delete them and do not move OAuth connections.
3. Record why that record is canonical: identity, dates, populated fields, queue, and which record current publishing actually uses.
4. Create one Brand Brain owned by that user, mapped in `airtable_entity_map` to the canonical record only.
5. Separate brand knowledge into fact, verified proof, positioning, strategic claim, external research, and proposed claim. Leave proof empty when none is stored.
6. Write a strategy and themes from the canonical record and the stated objective. Do not copy a duplicate product profile in as if it were the same offer.
7. Import ContentQueue rows that have a hook or body. Keep the Airtable record id. Do not mark unpublished rows as published. If no analytics exist, record performance as insufficient.
8. Classify each channel as connected and authorized, connected but unverified, supported but not connected, or not implemented. Do not change tokens.
9. Confirm an `OWNER_ACCOUNT` credential can list the new brand and the existing single-brand credential cannot.
10. Native intelligence is available as soon as the brand brain exists. Do not add the id to an environment allowlist.
