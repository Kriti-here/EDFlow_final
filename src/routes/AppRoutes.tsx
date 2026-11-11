import { BrowserRouter, Route, Routes } from "react-router-dom";

import AppLayout from "../layouts/AppLayout";
import AIInsights from "../pages/AIInsights";
import AuditLog from "../pages/AuditLog";
import Dashboard from "../pages/Dashboard";
import EDFPacks from "../pages/EDFPacks";
import ExceptionsHub from "../pages/ExceptionsHub";
import FiraDocuments from "../pages/FiraDocuments";
import InvoicesPage from "../pages/InvoicesPage";
import LandingPage from "../pages/LandingPage";
import MatchingCenter from "../pages/MatchingCenter";
import NotFound from "../pages/NotFound";
import PurposeAdvisor from "../pages/PurposeAdvisor";
import Settings from "../pages/Settings";
import UserGuide from "../pages/UserGuide";

/**
 * Application router. The landing page is standalone; every other screen is
 * nested under the shared workspace layout.
 */
function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/fira" element={<FiraDocuments />} />
          <Route path="/matching" element={<MatchingCenter />} />
          <Route path="/exceptions" element={<ExceptionsHub />} />
          <Route path="/purpose" element={<PurposeAdvisor />} />
          <Route path="/ai-insights" element={<AIInsights />} />
          <Route path="/edf-packs" element={<EDFPacks />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/guide" element={<UserGuide />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
