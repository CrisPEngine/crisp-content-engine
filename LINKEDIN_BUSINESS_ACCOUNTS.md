# LinkedIn Business Account Support

## Overview
Currently, the system only supports posting to personal LinkedIn profiles. To enable posting to business/company LinkedIn pages, we need to implement organization-level OAuth scopes and update the publishing logic.

## Current State
- ✅ Personal profile posting works (`person_urn`)
- ✅ Database schema already has `organisation_urn` field
- ❌ OAuth scopes don't include organization permissions
- ❌ Organization URNs are not fetched during connection
- ❌ Publishing function only supports personal URNs
- ❌ UI doesn't allow selecting which account to post to

## Required Changes

### 1. LinkedIn Developer Portal Configuration

#### Update OAuth Scopes
In your LinkedIn Developer Portal app settings, you need to:
1. Go to **Products** tab
2. Request access to:
   - `w_organization_social` - Write posts on behalf of company pages
   - `r_organization_social` - Read company page posts
3. Wait for LinkedIn approval (can take 1-2 weeks)

#### Verify App Association
- Ensure your LinkedIn app is associated with the company pages you want to post to
- The user connecting must be an admin of the company page

### 2. Code Changes

#### A. Update OAuth Authorization (`src/app/api/connections/linkedin/authorize/route.ts`)

**Current scopes:**
```typescript
const scope = ['w_member_social', 'openid', 'profile', 'email'].join(' ');
```

**Updated scopes:**
```typescript
const scope = [
  'w_member_social',        // Personal profile posting
  'w_organization_social',  // Company page posting (NEW)
  'r_organization_social',  // Read company pages (NEW)
  'openid',
  'profile',
  'email'
].join(' ');
```

#### B. Fetch Organization URNs (`src/app/api/connections/linkedin/callback/route.ts`)

Add a function to fetch organizations the user has admin access to:

```typescript
async function fetchLinkedInOrganizations(accessToken: string) {
  try {
    // Fetch organizations where user is an admin
    const res = await fetch(
      'https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

    if (!res.ok) {
      console.warn('Failed to fetch organizations:', await res.text());
      return [];
    }

    const data = await res.json();
    const organizations = data.elements || [];

    // Extract organization URNs and details
    return organizations.map((org: any) => ({
      urn: org.organizationalTarget,
      // Optionally fetch organization details
    }));
  } catch (error) {
    console.error('Error fetching organizations:', error);
    return [];
  }
}
```

Then in the callback handler, after fetching the profile:

```typescript
// Fetch organizations
const organizations = await fetchLinkedInOrganizations(accessToken);
const organisationUrns = organizations.map(org => org.urn).filter(Boolean);

// Store the first organization URN (or allow multiple)
// For now, store the first one. Later, we can support multiple.
const organisationUrn = organisationUrns[0] || null;

// Update the upsert to include organisation_urn
await admin.from('social_connections').upsert({
  user_id: user.id,
  provider: 'linkedin',
  access_token: encryptToken(accessToken),
  refresh_token: refreshToken ? encryptToken(refreshToken) : null,
  expires_at: expiresAt?.toISOString() ?? null,
  person_urn: details.personUrn,
  organisation_urn: organisationUrn, // NEW
  account_name: details.displayName,
  account_avatar: details.avatarUrl,
  metadata: {
    ...profile,
    organizations: organisations, // Store all orgs for future use
  },
  updated_at: new Date().toISOString(),
});
```

#### C. Update Publishing Function (`src/lib/linkedin/publish.ts`)

Modify `publishToLinkedIn` to accept an optional `accountType` parameter:

```typescript
export async function publishToLinkedIn(
  accessToken: string,
  personUrn: string,
  content: {
    title?: string;
    body: string;
    hashtags?: string;
    imageUrl?: string;
  },
  idempotencyKey?: string,
  accountType: 'personal' | 'organization' = 'personal', // NEW
  organisationUrn?: string // NEW
): Promise<PublishResult> {
  // ... existing code ...

  // Determine which URN to use
  let authorUrn: string;
  if (accountType === 'organization' && organisationUrn) {
    // Ensure organisation_urn is in correct format
    authorUrn = organisationUrn.startsWith('urn:li:organization:')
      ? organisationUrn
      : `urn:li:organization:${organisationUrn}`;
  } else {
    // Use personal URN (existing logic)
    authorUrn = formattedPersonUrn;
  }

  // Update image upload to use correct URN
  if (content.imageUrl && content.imageUrl.trim()) {
    try {
      const imageUploadResult = await uploadImageToLinkedIn(
        accessToken,
        authorUrn, // Use the correct URN
        content.imageUrl
      );
      mediaAsset = imageUploadResult.asset;
    } catch (error: any) {
      console.error('Failed to upload image, publishing text-only post:', error);
    }
  }

  // Update payload to use authorUrn
  const payload = {
    author: authorUrn, // Use determined URN
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': shareContent,
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  // ... rest of existing code ...
}
```

Also update `uploadImageToLinkedIn` to accept either person or organization URN:

```typescript
async function uploadImageToLinkedIn(
  accessToken: string,
  ownerUrn: string, // Changed from personUrn to ownerUrn (can be person or org)
  imageUrl: string
): Promise<{ asset: string }> {
  // ... existing code ...
  
  // Remove the person_urn formatting - just use the URN as-is
  // It can be either urn:li:person:xxx or urn:li:organization:xxx
  const formattedOwnerUrn = ownerUrn; // Use as-is

  // ... rest of existing code, using formattedOwnerUrn ...
}
```

#### D. Update Publishing Job (`src/app/api/publish/linkedin-due/route.ts`)

Modify to support organization accounts. You'll need to:
1. Add a field to ContentQueue in Airtable: `linkedin_account_type` (select: "Personal" or "Organization")
2. Fetch the account type when publishing
3. Pass it to `publishToLinkedIn`

```typescript
// In the publishDueContent function
const accountType = fields.linkedin_account_type || 'personal';
const organisationUrn = connection.organisation_urn || null;

const publishResult = await publishToLinkedIn(
  connection.accessToken,
  connection.personUrn,
  {
    title,
    body,
    hashtags,
  },
  imageUrl,
  record.id,
  accountType, // NEW
  organisationUrn // NEW
);
```

#### E. Update Connection Retrieval (`src/lib/linkedin/publish.ts`)

Modify `getLinkedInConnection` to return both URNs:

```typescript
export interface LinkedInConnectionResult {
  accessToken: string;
  personUrn: string;
  organisationUrn?: string; // NEW
}
```

```typescript
export async function getLinkedInConnection(
  userId: string
): Promise<LinkedInConnectionResult | LinkedInConnectionError | null> {
  // ... existing code ...

  // Get organisation_urn if available
  const organisationUrn = connection.organisation_urn || null;

  return {
    accessToken,
    personUrn,
    organisationUrn, // NEW
  };
}
```

### 3. Database Schema Updates

The `social_connections` table already has `organisation_urn` field, so no schema changes needed. However, you may want to add:

- `organisation_name` - Display name of the company page
- `organisation_avatar` - Company page logo/avatar

### 4. UI Changes

#### A. Connections Page (`src/app/(app)/connections/page.tsx`)

Update to show both personal and organization accounts:

```typescript
// Display both personal and organization connections
{connection.person_urn && (
  <div>Personal Profile: {connection.account_name}</div>
)}
{connection.organisation_urn && (
  <div>Company Page: {connection.organisation_name || 'Company Page'}</div>
)}
```

#### B. Content Approval Queue (`src/app/(app)/content/approval/page.tsx`)

Add a selector to choose which account to post to:

```typescript
// Add account type selector for LinkedIn posts
{platform === 'LinkedIn' && (
  <select
    value={item.linkedin_account_type || 'personal'}
    onChange={(e) => handleAccountTypeChange(item.id, e.target.value)}
  >
    <option value="personal">Personal Profile</option>
    {hasOrganisationUrn && (
      <option value="organization">Company Page</option>
    )}
  </select>
)}
```

#### C. Content Generation Modal

When generating content, allow users to select account type for LinkedIn.

### 5. Airtable Schema Updates

Add to `ContentQueue` table:
- `linkedin_account_type` (Single select: "Personal", "Organization")
  - Default: "Personal"
  - Used to determine which account to post to

### 6. Testing Checklist

- [ ] Connect LinkedIn account with organization admin access
- [ ] Verify `organisation_urn` is stored in database
- [ ] Test posting to personal profile (existing functionality)
- [ ] Test posting to organization page (new functionality)
- [ ] Test image uploads for both account types
- [ ] Verify account type selector in UI
- [ ] Test scheduled posts for both account types

## Implementation Priority

1. **Phase 1**: Backend support (OAuth scopes, fetching orgs, publishing logic)
2. **Phase 2**: Database and API updates (store org URNs, pass to publishing)
3. **Phase 3**: UI updates (account selector, display org info)

## Important Notes

1. **LinkedIn Approval**: The `w_organization_social` and `r_organization_social` scopes require LinkedIn approval, which can take 1-2 weeks.

2. **Admin Access**: Users must be administrators of the company page to post on its behalf.

3. **Multiple Organizations**: A user may have admin access to multiple company pages. Consider:
   - Storing all organizations in metadata
   - Allowing users to select which organization to use
   - Supporting multiple connections (one per organization)

4. **Backward Compatibility**: Ensure existing personal profile posts continue to work.

5. **Error Handling**: Handle cases where:
   - User loses admin access to a company page
   - Organization URN becomes invalid
   - Token doesn't have organization permissions

## References

- [LinkedIn UGC Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/ugc-post-api)
- [LinkedIn Organization Social Permissions](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control)
- [LinkedIn OAuth Scopes](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication)

