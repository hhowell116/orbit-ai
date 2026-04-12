import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  Navigate,
} from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { TeamSelectionPage } from "./pages/TeamSelectionPage";
import { TeamSettingsPage } from "./pages/TeamSettingsPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectPage } from "./pages/ProjectPage";

// Requires auth token but no team
function AuthOnlyLayout() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// Requires auth token AND active team
function ProtectedLayout() {
  const token = useAuthStore((s) => s.token);
  const activeTeam = useAuthStore((s) => s.activeTeam);
  if (!token) return <Navigate to="/login" replace />;
  if (!activeTeam) return <Navigate to="/teams" replace />;
  return <Outlet />;
}

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/signup",
    element: <SignupPage />,
  },
  {
    element: <AuthOnlyLayout />,
    children: [
      {
        path: "/teams",
        element: <TeamSelectionPage />,
      },
      {
        path: "/teams/:teamId/settings",
        element: <TeamSettingsPage />,
      },
    ],
  },
  {
    element: <ProtectedLayout />,
    children: [
      {
        path: "/",
        element: <ProjectsPage />,
      },
      {
        path: "/project/:projectId",
        element: <ProjectPage />,
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/login" replace />,
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
