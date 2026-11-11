import { useEffect, useRef, useState } from "react";

/**
 * Observe an element and report once it has entered the viewport.
 * Disconnects after the first intersection so reveals play a single time.
 */
export function useInView<T extends HTMLElement>(
  rootMargin = "0px 0px -10% 0px",
) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;

    // Fall back to visible when IntersectionObserver is unavailable.
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}
