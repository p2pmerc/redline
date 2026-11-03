import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { LandingPage } from "@/pages/landing-page";
import { AuthGate } from "@/components/app/auth-gate";
import { ReportPageSkeleton } from "@/components/feedback/skeleton";
import { AppShell } from "@/components/app/app-shell";
import { DisclosureDetailPage, DisclosuresPage, NotFoundPage } from "@/pages/public-pages";

const DashboardPage = lazy(() => import("@/pages/app/dashboard-page").then((m) => ({ default: m.DashboardPage })));
const NewReportPage = lazy(() => import("@/pages/app/new-report-page").then((m) => ({ default: m.NewReportPage })));
const ReportDetailPage = lazy(() => import("@/pages/app/report-detail-page").then((m) => ({ default: m.ReportDetailPage })));

export function App() {
  return (
    <Suspense fallback={<ReportPageSkeleton />}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/disclosures" element={<DisclosuresPage />} />
      <Route path="/disclosures/:id" element={<DisclosureDetailPage />} />
      <Route path="/app" element={<AuthGate />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="reports/new" element={<NewReportPage />} />
          <Route path="reports/:id" element={<ReportDetailPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  );
}
