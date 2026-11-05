import type { DetectResponse } from "@/lib/scene-types";

const cache = new Map<string, Promise<DetectResponse>>();

/** Detecta móveis da foto (uma chamada por foto; falhas não ficam em cache). */
export function detectObjects(roomImage: string): Promise<DetectResponse> {
  const cached = cache.get(roomImage);
  if (cached) return cached;
  const promise: Promise<DetectResponse> = fetch("/api/room/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomImage }),
  })
    .then((r) => r.json() as Promise<DetectResponse>)
    .then((j) => ({
      success: !!j.success,
      objects: Array.isArray(j.objects) ? j.objects : [],
      fallbackReason: j.fallbackReason,
    }))
    .catch(
      (): DetectResponse => ({
        success: false,
        objects: [],
        fallbackReason: "Não foi possível analisar a foto agora. Tente novamente.",
      })
    );
  cache.set(roomImage, promise);
  promise.then((r) => {
    if (r.objects.length === 0) cache.delete(roomImage);
  });
  return promise;
}
