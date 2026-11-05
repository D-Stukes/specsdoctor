import React, { lazy } from "react";
import { createBrowserRouter, RouterProvider, Route, Routes } from "react-router-dom";
// Aliased import: the Scanner cannot resolve "@/..." without a bundler
// config, so this import stays unresolved.
import Nav from "@/components/Nav";
import HabitsPage from "./pages/HabitsPage";

// Dynamic import: code-split the settings page.
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

export const router = createBrowserRouter([
  { path: "/", element: <HabitsPage /> },
  { path: "/settings", element: <SettingsPage /> },
]);

export default function App() {
  return (
    <>
      <Nav userName="demo" onSignOut={() => {}} />
      <Routes>
        <Route path="/habits" element={<HabitsPage />} />
      </Routes>
      <RouterProvider router={router} />
    </>
  );
}
