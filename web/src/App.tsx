import { Route, Routes } from "react-router-dom";
import { LandingPage } from "@/pages/landing-page";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
