import { NextResponse } from "next/server";
import { SORT_OPTIONS, getCategoryGroups } from "@/lib/benoit-api";

export const revalidate = 3600;

/** GET /api/benoit/categories → grupos de categorias do site e opções de ordenação */
export async function GET() {
  try {
    const groups = await getCategoryGroups();
    return NextResponse.json({ success: true, groups, sortOptions: SORT_OPTIONS });
  } catch (error) {
    console.error("Erro ao carregar categorias da Benoit:", error);
    return NextResponse.json({ success: false, groups: [], sortOptions: SORT_OPTIONS }, { status: 502 });
  }
}
