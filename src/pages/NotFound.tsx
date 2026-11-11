import { Link } from "react-router-dom";

import MaterialIcon from "../components/landing/MaterialIcon";
import PageShell from "../components/PageShell";

/**
 * Catch-all for unknown workspace URLs. Rendered inside the workspace layout so
 * the sidebar stays available instead of leaving the user on a blank screen.
 */
function NotFound() {
  return (
    <PageShell
      title="Page not found"
      description="That route is not part of the EDFlow workspace."
    >
      <div className="flex flex-col items-center gap-3 py-space-xl text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MaterialIcon name="explore_off" className="text-[22px]" />
        </span>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Pick a module from the sidebar, or jump back to the dashboard.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 font-label-md text-label-md font-semibold text-on-primary transition-all hover:bg-primary-container active:scale-95"
        >
          <MaterialIcon name="dashboard" className="text-[18px]" />
          <span>Go to Dashboard</span>
        </Link>
      </div>
    </PageShell>
  );
}

export default NotFound;
