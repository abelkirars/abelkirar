import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const desalegFile = formData.get("desaleg") as File;
    const gashFile = formData.get("gash") as File;

    if (!desalegFile || !gashFile) {
      return Response.json({
        error: "Both desaleg and gash images are required",
      }, { status: 400 });
    }

    // Upload Desaleg image
    const desalegBuffer = await desalegFile.arrayBuffer();
    const { error: desalegError } = await supabase.storage
      .from("product-images")
      .upload("kirar-desaleg.png", desalegBuffer, { upsert: true });

    if (desalegError) {
      return Response.json({ error: desalegError.message }, { status: 500 });
    }

    // Upload Gash image
    const gashBuffer = await gashFile.arrayBuffer();
    const { error: gashError } = await supabase.storage
      .from("product-images")
      .upload("kirar-gash-tesfay.png", gashBuffer, { upsert: true });

    if (gashError) {
      return Response.json({ error: gashError.message }, { status: 500 });
    }

    const desalegUrl = `${supabaseUrl}/storage/v1/object/public/product-images/kirar-desaleg.png`;
    const gashUrl = `${supabaseUrl}/storage/v1/object/public/product-images/kirar-gash-tesfay.png`;
    const normalUrl = `${supabaseUrl}/storage/v1/object/public/product-images/kirar.png`;

    // Update Heritage Kirar product with variants
    const variants = [
      { name: "Normal Kirar", image: normalUrl },
      { name: "Desaleg Kirar", image: desalegUrl },
      { name: "Gash Tesfay Kirar", image: gashUrl },
    ];

    const product = await prisma.product.update({
      where: { slug: "heritage-kirar" },
      data: {
        variants: variants,
      },
    });

    return Response.json({
      success: true,
      message: "Kirar variants configured successfully",
      variants,
      product,
    });
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
