import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import path from "path";
import os from "os";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET() {
  try {
    const homeDir = os.homedir();
    const desktopDir = path.join(homeDir, "Desktop", "product-images");

    const files = [
      { srcName: "kirar.png", bucket: "product-images", filename: "kirar.png" },
      { srcName: "begena.png", bucket: "product-images", filename: "begena.png" },
      {
        srcName: "mesenko.png",
        bucket: "product-images",
        filename: "mesenko.png",
      },
    ];

    const uploadedUrls: Record<string, string> = {};

    for (const file of files) {
      const filePath = path.join(desktopDir, file.srcName);
      console.log(`Reading file from: ${filePath}`);

      const fileBuffer = readFileSync(filePath);

      const { data, error } = await supabase.storage
        .from(file.bucket)
        .upload(file.filename, fileBuffer, { upsert: true });

      if (error) {
        console.error(`Error uploading ${file.srcName}:`, error);
        continue;
      }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${file.bucket}/${file.filename}`;
      uploadedUrls[file.srcName] = publicUrl;
    }

    return Response.json({ success: true, uploadedUrls });
  } catch (error) {
    console.error("Upload error:", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
