"use client";

import { useMemo, useState } from "react";
import type { BenoitProduct } from "@/data/benoit-catalog";
import type { RoomMeasurements } from "@/lib/scene-types";
import { evaluateFit, fitsSpace, type FitResult } from "@/lib/fit";

const EMPTY: RoomMeasurements = { widthCm: 0, heightCm: 0, depthCm: 0 };

/** Estado do filtro "Cabe no meu espaço", compartilhado pela tela de produtos e pelo navegador In-App. */
export function useFitFilter(products: BenoitProduct[], roomMeasurements?: RoomMeasurements) {
  const [enabled, setEnabled] = useState(false);
  const [edited, setEdited] = useState<RoomMeasurements | null>(null);
  const space = edited ?? roomMeasurements ?? EMPTY;
  const hasSpace = space.widthCm > 0 && space.heightCm > 0 && space.depthCm > 0;

  const fits = useMemo(() => {
    const map = new Map<string, FitResult>();
    if (hasSpace) for (const p of products) map.set(p.id, evaluateFit(p, space));
    return map;
  }, [products, space, hasSpace]);

  const visible = useMemo(
    () => (enabled && hasSpace ? products.filter((p) => fitsSpace(fits.get(p.id)!.status)) : products),
    [enabled, hasSpace, products, fits]
  );
  const fitCount = useMemo(
    () => products.filter((p) => fits.get(p.id) && fitsSpace(fits.get(p.id)!.status)).length,
    [products, fits]
  );

  return { enabled, setEnabled, space, setSpace: setEdited, hasSpace, fits, visible, fitCount };
}
