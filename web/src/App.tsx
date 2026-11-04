import { Suspense } from "react";
import { lazyWithReload } from "@/lib/chunk-reload";
import { Route, Routes } from "react-router-dom";
import { ScrollManager } from "@/components/layout/scroll-manager";
import { LandingPage } from "@/pages/landing-page";
import { AuthGate } from "@/components/app/auth-gate";
import { ReportPageSkeleton } from "@/components/feedback/skeleton";
import { AppShell } from "@/components/app/app-shell";
import { ProfileGate } from "@/lib/profile-context";
import { DisclosureDetailPage, DisclosuresPage, NotFoundPage } from "@/pages/public-pages";
import { LeaderboardPage, ResearcherPage } from "@/pages/leaderboard-pages";

const DashboardPage = lazyWithReload(() => import("@/pages/app/dashboard-page").then((m) => ({ default: m.DashboardPage })));
const NewReportPage = lazyWithReload(() => import("@/pages/app/new-report-page").then((m) => ({ default: m.NewReportPage })));
const InviteRedeemPage = lazyWithReload(() => import("@/pages/app/invite-redeem-page").then((m) => ({ default: m.InviteRedeemPage })));
const WelcomePage = lazyWithReload(() => import("@/pages/app/welcome-page").then((m) => ({ default: m.WelcomePage })));
const SettingsPage = lazyWithReload(() => import("@/pages/app/settings-page").then((m) => ({ default: m.SettingsPage })));
const ReportDetailPage = lazyWithReload(() => import("@/pages/app/report-detail-page").then((m) => ({ default: m.ReportDetailPage })));

export function App() {
  return (
    <Suspense fallback={<ReportPageSkeleton />}>
    <ScrollManager />
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/disclosures" element={<DisclosuresPage />} />
      <Route path="/disclosures/:id" element={<DisclosureDetailPage />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
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
