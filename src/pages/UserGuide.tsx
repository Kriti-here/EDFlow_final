import PageShell from "../components/PageShell";
import { getNavItem } from "../config/navigation";

const { label, description } = getNavItem("/guide");

function UserGuide() {
  return <PageShell title={label} description={description} />;
}

export default UserGuide;
