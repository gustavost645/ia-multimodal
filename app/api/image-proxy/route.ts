import { NextRequest } from "next/server";
import { fetchRemoteImage, RemoteImageError } from "@/lib/remote-image";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return Response.json({ success: false, error: "Parâmetro url ausente." }, { status: 400 });
  }
  try {
    const { data, contentType } = await fetchRemoteImage(url);
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    const status = err instanceof RemoteImageError ? err.status : 502;
    const message = err instanceof RemoteImageError ? err.message : "Falha ao buscar a imagem.";
    return Response.json({ success: false, error: message }, { status });
  }
}
