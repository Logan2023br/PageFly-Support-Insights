"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

/** Đọc/ghi tham số URL; mọi bộ lọc đều nằm trên URL để chia sẻ được bằng link. */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const hrefFor = useCallback(
    (patch: Record<string, string | null | undefined>, path = pathname) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const s = next.toString();
      return s ? `${path}?${s}` : path;
    },
    [params, pathname],
  );

  const update = useCallback(
    (patch: Record<string, string | null | undefined>, opts: { replace?: boolean } = {}) => {
      const href = hrefFor(patch);
      startTransition(() => (opts.replace ? router.replace(href, { scroll: false }) : router.push(href, { scroll: false })));
    },
    [hrefFor, router],
  );

  return { params, update, hrefFor, pending };
}
