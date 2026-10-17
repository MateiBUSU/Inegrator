import { Route, Routes } from "react-router";
import { RequireAuth, RequireRole } from "./auth/guards";
import { Layout } from "./components/layout";
import { ComingSoonPage } from "./pages/coming-soon-page";
import { ForbiddenPage } from "./pages/forbidden-page";
import { HomePage } from "./pages/home-page";
import { LoginPage } from "./pages/login-page";
import { NotFoundPage } from "./pages/not-found-page";
import { RegisterPage } from "./pages/register-page";
import { StudentClassesPage } from "./pages/student-classes-page";
import { TeacherClassesPage } from "./pages/teacher-classes-page";

/** The route table. The router itself is provided by the caller (BrowserRouter / MemoryRouter). */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forbidden" element={<ForbiddenPage />} />

        {/* UI guards only: the API enforces authentication, roles and ownership itself. */}
        <Route element={<RequireAuth />}>
          <Route element={<RequireRole role="teacher" />}>
            <Route path="teacher/classes" element={<TeacherClassesPage />} />
            <Route
              path="teacher/classes/:id"
              element={<ComingSoonPage title="Clasă" backTo="/teacher/classes" />}
            />
            <Route
              path="teacher/materials"
              element={<ComingSoonPage title="Materiale" backTo="/teacher/classes" />}
            />
            <Route
              path="teacher/materials/:id"
              element={<ComingSoonPage title="Material" backTo="/teacher/materials" />}
            />
          </Route>
          <Route element={<RequireRole role="student" />}>
            <Route path="student/classes" element={<StudentClassesPage />} />
            <Route
              path="student/classes/:id"
              element={<ComingSoonPage title="Clasă" backTo="/student/classes" />}
            />
            <Route
              path="student/materials/:id"
              element={<ComingSoonPage title="Material" backTo="/student/classes" />}
            />
            <Route
              path="student/progress"
              element={<ComingSoonPage title="Progres" backTo="/student/classes" />}
            />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
