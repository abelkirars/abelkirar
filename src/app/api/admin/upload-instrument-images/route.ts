import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  try {
    const formData = await request.formData();

    const uploads: Record<string, string> = {};
    const filesToProcess = [
      { field: "kirar", productSlug: "normal-kirar", filename: "kirar.png" },
      { field: "begena", productSlug: "processional-begena", filename: "begena.png" },
      { field: "masenqo", productSlug: "travelers-masenqo", filename: "masenqo.png" },
    ];

    for (const fileConfig of filesToProcess) {
      const file = formData.get(fileConfig.field) as File;
      if (!file) continue;

      const buffer = await file.arrayBuffer();
      const { error } = await supabase.storage
        .from("product-images")
        .upload(fileConfig.filename, buffer, { upsert: true });

      if (error) {
        console.error(`Error uploading ${fileConfig.field}:`, error);
        continue;
      }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/product-images/${fileConfig.filename}`;
      uploads[fileConfig.field] = publicUrl;

      // Update product in database
      await prisma.product.update({
        where: { slug: fileConfig.productSlug },
        data: {
          images: [publicUrl],
        },
      });
    }

    return Response.json({ success: true, uploads });
  } catch (error) {
    console.error("Upload error:", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
