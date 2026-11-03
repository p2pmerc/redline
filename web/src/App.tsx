import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { captureInviteKey } from "@/lib/report-key-vault";
import { LandingPage } from "@/pages/landing-page";
import { AuthGate } from "@/components/app/auth-gate";
import { ReportPageSkeleton } from "@/components/feedback/skeleton";
import { AppShell } from "@/components/app/app-shell";
import { ProfileGate } from "@/lib/profile-context";
import { DisclosureDetailPage, DisclosuresPage, NotFoundPage, ResearcherPage } from "@/pages/public-pages";

const DashboardPage = lazy(() => import("@/pages/app/dashboard-page").then((m) => ({ default: m.DashboardPage })));
const NewReportPage = lazy(() => import("@/pages/app/new-report-page").then((m) => ({ default: m.NewReportPage })));
const InviteRedeemPage = lazy(() => import("@/pages/app/invite-redeem-page").then((m) => ({ default: m.InviteRedeemPage })));
const WelcomePage = lazy(() => import("@/pages/app/welcome-page").then((m) => ({ default: m.WelcomePage })));
const SettingsPage = lazy(() => import("@/pages/app/settings-page").then((m) => ({ default: m.SettingsPage })));
const ReportDetailPage = lazy(() => import("@/pages/app/report-detail-page").then((m) => ({ default: m.ReportDetailPage })));

export function App() {
  // Runs before the sign-in gate can redirect, so an invite key in the URL fragment is not lost.
  const location = useLocation();
  captureInviteKey(location.pathname, location.hash);
  return (
    <Suspense fallback={<ReportPageSkeleton />}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/disclosures" element={<DisclosuresPage />} />
      <Route path="/disclosures/:id" element={<DisclosureDetailPage />} />
      <Route path="/researchers/:handle" element={<ResearcherPage />} />
      <Route path="/app" element={<AuthGate />}>
        <Route element={<ProfileGate />}>
        <Route path="welcome" element={<WelcomePage />} />
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="reports/new" element={<NewReportPage />} />
          <Route path="invite/:token" element={<InviteRedeemPage />} />
          <Route path="reports/:id" element={<ReportDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  );
}
