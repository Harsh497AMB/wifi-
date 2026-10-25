/**
 * Backfill script: fetch imageWidth and imageHeight from Cloudinary for every
 * Block whose blockImage.imageWidth is missing, then sync those values into
 * every matching blocks[] entry inside Wifi documents.
 *
 * Run ONCE after deploying the schema change:
 *   node scripts/backfillImageSize.js
 */

'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const { cloudinary } = require('../src/config/cloudinary');
const connectDB = require('../src/config/db');
const Block = require('../src/models/Block');
const Wifi  = require('../src/models/Wifi');

async function main() {
  await connectDB();
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB connection was not established. Check MONGODB_URI.');
  }

  console.log('Connected to MongoDB.');

  // Find blocks that are missing imageWidth
  const blocks = await Block.find({ 'blockImage.imageWidth': null });
  console.log(`Found ${blocks.length} block(s) to backfill.`);

  for (const block of blocks) {
    const publicId = block.blockImage?.filename;
    if (!publicId) {
      console.log(`  [SKIP] Block ${block.blockId} — no filename stored.`);
      continue;
    }

    try {
      const info = await cloudinary.api.resource(publicId);
      const w = info.width;
      const h = info.height;
      if (!Number.isFinite(w) || !Number.isFinite(h)) {
        console.log(`  [SKIP] Block ${block.blockId} (${publicId}) has no Cloudinary dimensions.`);
        continue;
      }

      // Update the master Block document
      await Block.updateOne(
        { _id: block._id },
        { $set: { 'blockImage.imageWidth': w, 'blockImage.imageHeight': h } }
      );

      // Update every Wifi document that contains this block in its blocks[] array
      const result = await Wifi.updateMany(
        { 'blocks.blockId': block.blockId },
        {
          $set: {
            'blocks.$[elem].blockImage.imageWidth':  w,
            'blocks.$[elem].blockImage.imageHeight': h
          }
        },
        { arrayFilters: [{ 'elem.blockId': block.blockId }] }
      );

      console.log(
        `  [OK]   Block ${block.blockId} (${publicId}) → ${w}x${h}` +
        ` | Wifi docs updated: ${result.modifiedCount}`
      );
    } catch (err) {
      console.error(`  [SKIP] Block ${block.blockId} (${publicId}): ${err.message}`);
    }
  }

  console.log('Backfill complete.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

