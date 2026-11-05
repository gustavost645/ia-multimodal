import { NextRequest, NextResponse } from "next/server";
import { findVariants } from "@/lib/benoit-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/benoit/variants?name=<nome do produto>&id=<product.id>
 * → { success, variants: BenoitProduct[] } (mesmo modelo em outras cores, sem o próprio produto)
 */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim() ?? "";
  const id = req.nextUrl.searchParams.get("id")?.trim() || undefined;
  if (name.length < 3 || name.length > 200) {
    return NextResponse.json({ success: false, variants: [], error: "Informe o nome do produto." }, { status: 400 });
  }
  try {
    const variants = await findVariants(name, id);
    return NextResponse.json({ success: true, variants });
  } catch (e) {
    return NextResponse.json(
      { success: false, variants: [], error: e instanceof Error ? e.message : "Falha ao buscar variações." },
      { status: 502 }
    );
  }
}
