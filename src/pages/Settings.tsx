import PageShell from "../components/PageShell";
import { getNavItem } from "../config/navigation";

const { label, description } = getNavItem("/settings");

function Settings() {
  return <PageShell title={label} description={description} />;
}

export default Settings;
