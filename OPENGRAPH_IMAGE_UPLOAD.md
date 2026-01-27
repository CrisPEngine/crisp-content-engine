# OpenGraph Image Upload Instructions

## Current Status

The metadata in `src/app/layout.tsx` has been updated with a placeholder URL. You need to:

1. Upload the OpenGraph image to Cloudinary
2. Replace the placeholder URL in the metadata

## Option 1: Upload via Cloudinary Dashboard (Easiest)

1. Go to [Cloudinary Dashboard](https://cloudinary.com/console)
2. Navigate to Media Library
3. Upload your OpenGraph image
4. After upload, copy the **Secure URL** (should look like: `https://res.cloudinary.com/dr75zvtso/image/upload/v1234567890/filename.jpg`)
5. Update `src/app/layout.tsx`:
   - Replace the URL in `openGraph.images[0].url`
   - Replace the URL in `twitter.images[0]`

## Option 2: Upload via Script

If you have the image file saved locally:

```bash
# Make sure you have Cloudinary env vars set
export CLOUDINARY_CLOUD_NAME=your_cloud_name
export CLOUDINARY_API_KEY=your_api_key
export CLOUDINARY_API_SECRET=your_api_secret

# Run the upload script
node scripts/upload-opengraph-image.js /path/to/your/opengraph-image.png
```

The script will output the Cloudinary URL - copy it and update `src/app/layout.tsx`.

## Image Requirements

- **Recommended size:** 1200x627 pixels (OpenGraph standard)
- **Format:** PNG or JPG
- **File size:** Under 5MB recommended

## After Upload

Update both URLs in `src/app/layout.tsx`:
- Line with `openGraph.images[0].url`
- Line with `twitter.images[0]`

Then commit and push the changes.
