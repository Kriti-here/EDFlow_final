import PageShell from "../components/PageShell";
import { getNavItem } from "../config/navigation";

const { label, description } = getNavItem("/ai-insights");

function AIInsights() {
  return <PageShell title={label} description={description} />;
}

export default AIInsights;
