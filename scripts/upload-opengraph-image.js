#!/usr/bin/env node

/**
 * Script to upload OpenGraph image to Cloudinary
 * 
 * Usage:
 *   node scripts/upload-opengraph-image.js <path-to-image-file>
 * 
 * Example:
 *   node scripts/upload-opengraph-image.js ~/Downloads/crisp-opengraph.png
 */

const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const imagePath = process.argv[2];

if (!imagePath) {
  console.error('Error: Please provide the path to the image file');
  console.error('Usage: node scripts/upload-opengraph-image.js <path-to-image-file>');
  process.exit(1);
}

if (!fs.existsSync(imagePath)) {
  console.error(`Error: File not found: ${imagePath}`);
  process.exit(1);
}

// Check Cloudinary config
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('Error: Cloudinary environment variables not set');
  console.error('Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
  process.exit(1);
}

async function uploadImage() {
  try {
    console.log(`Uploading ${imagePath} to Cloudinary...`);
    
    const result = await cloudinary.uploader.upload(imagePath, {
      folder: 'crisp-content-engine',
      public_id: 'opengraph-image',
      overwrite: true,
      resource_type: 'image',
      transformation: [
        { width: 1200, height: 627, crop: 'fill', quality: 'auto', fetch_format: 'auto' },
      ],
    });

    console.log('\n✅ Upload successful!');
    console.log('\n📋 Update the following URL in src/app/layout.tsx:');
    console.log(`\n   ${result.secure_url}\n`);
    console.log('Replace both openGraph.images[0].url and twitter.images[0] with this URL.');
    
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    process.exit(1);
  }
}

uploadImage();
