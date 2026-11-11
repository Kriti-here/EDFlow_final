import type { ReactNode } from "react";
import MaterialIcon from "./landing/MaterialIcon";

type PageShellProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

/**
 * Consistent header + panel wrapper for every workspace page.
 * Renders a neutral placeholder when a page has no body yet.
 */
function PageShell({ title, description, children }: PageShellProps) {
  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-space-lg">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight text-on-surface md:text-headline-lg">
          {title}
        </h1>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          {description}
        </p>
      </div>

      <div className="rounded-2xl border border-surface-container-high/80 bg-surface-container-lowest p-space-lg shadow-sm">
        {children ?? (
          <div className="flex flex-col items-center gap-2 py-space-xl text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MaterialIcon name="construction" className="text-[22px]" />
            </span>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Navigation is wired. This module connects to the API in a later step.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export default PageShell;
