import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const BUCKET_NAME = "product-images";
const IMAGES_DIR = path.join(process.cwd(), "public", "products-to-upload");

async function ensureBucketExists() {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === BUCKET_NAME);

    if (!bucketExists) {
      console.log(`Creating bucket: ${BUCKET_NAME}`);
      await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
      });
      console.log("✓ Bucket created");
    } else {
      console.log(`✓ Bucket "${BUCKET_NAME}" already exists`);
    }
  } catch (err) {
    console.error("Error ensuring bucket exists:", err);
    throw err;
  }
}

async function uploadImage(filePath: string): Promise<string> {
  const fileName = path.basename(filePath);
  const fileContent = fs.readFileSync(filePath);
  const mimeType = getMimeType(filePath);

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, fileContent, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) throw error;

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${fileName}`;
    console.log(`✓ Uploaded: ${fileName}`);
    console.log(`  URL: ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    console.error(`✗ Failed to upload ${fileName}:`, err);
    throw err;
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

async function main() {
  try {
    console.log("Starting product image upload...\n");

    // Ensure bucket exists
    await ensureBucketExists();
    console.log();

    // Check if directory exists
    if (!fs.existsSync(IMAGES_DIR)) {
      console.log(`Directory not found: ${IMAGES_DIR}`);
      console.log("Please create this directory and place your product images there.");
      console.log("\nSupported formats: JPG, PNG, WebP, GIF\n");
      process.exit(1);
    }

    // Get list of image files
    const files = fs.readdirSync(IMAGES_DIR);
    const imageFiles = files.filter((f) => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));

    if (imageFiles.length === 0) {
      console.log("No image files found in:", IMAGES_DIR);
      console.log("Place your product images (JPG, PNG, WebP, GIF) in that directory.\n");
      process.exit(1);
    }

    console.log(`Found ${imageFiles.length} image(s) to upload:\n`);

    // Upload each image
    const uploadedUrls: Record<string, string> = {};
    for (const file of imageFiles) {
      const filePath = path.join(IMAGES_DIR, file);
      const publicUrl = await uploadImage(filePath);
      uploadedUrls[file] = publicUrl;
    }

    // Output JSON for use in seed script
    console.log("\n✓ Upload complete! Use these URLs in your seed script:\n");
    console.log(JSON.stringify(uploadedUrls, null, 2));

    // Save URLs to a file for reference
    const outputPath = path.join(process.cwd(), "uploaded-image-urls.json");
    fs.writeFileSync(outputPath, JSON.stringify(uploadedUrls, null, 2));
    console.log(`\nURLs saved to: ${outputPath}`);
  } catch (err) {
    console.error("Upload failed:", err);
    process.exit(1);
  }
}

main();
