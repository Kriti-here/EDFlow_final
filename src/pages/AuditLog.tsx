import PageShell from "../components/PageShell";
import { getNavItem } from "../config/navigation";

const { label, description } = getNavItem("/audit");

function AuditLog() {
  return <PageShell title={label} description={description} />;
}

export default AuditLog;
