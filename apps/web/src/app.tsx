import { Route, Routes } from "react-router";
import { RequireAuth, RequireRole } from "./auth/guards";
import { Layout } from "./components/layout";
import { ForbiddenPage } from "./pages/forbidden-page";
import { HomePage } from "./pages/home-page";
import { LoginPage } from "./pages/login-page";
import { NotFoundPage } from "./pages/not-found-page";
import { RegisterPage } from "./pages/register-page";
import { StudentClassDetailPage } from "./pages/student-class-detail-page";
import { StudentClassesPage } from "./pages/student-classes-page";
import { StudentMaterialPage } from "./pages/student-material-page";
import { StudentProgressPage } from "./pages/student-progress-page";
import { StudentTopicDetailPage } from "./pages/student-topic-detail-page";
import { StudentTopicMaterialPage } from "./pages/student-topic-material-page";
import { StudentTopicsPage } from "./pages/student-topics-page";
import { TeacherClassDetailPage } from "./pages/teacher-class-detail-page";
import { TeacherClassesPage } from "./pages/teacher-classes-page";
import { TeacherGeneratePage } from "./pages/teacher-generate-page";
import { TeacherMaterialPage } from "./pages/teacher-material-page";
import { TeacherMaterialsPage } from "./pages/teacher-materials-page";
import { TeacherStudentProgressPage } from "./pages/teacher-student-progress-page";

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
            <Route path="teacher/classes/:id" element={<TeacherClassDetailPage />} />
            <Route
              path="teacher/classes/:id/students/:studentId"
              element={<TeacherStudentProgressPage />}
            />
            <Route path="teacher/materials" element={<TeacherMaterialsPage />} />
            <Route path="teacher/materials/new" element={<TeacherGeneratePage />} />
            <Route path="teacher/materials/:id" element={<TeacherMaterialPage />} />
          </Route>
          <Route element={<RequireRole role="student" />}>
            <Route path="student/classes" element={<StudentClassesPage />} />
            <Route path="student/classes/:id" element={<StudentClassDetailPage />} />
            <Route path="student/materials/:id" element={<StudentMaterialPage />} />
            <Route path="student/topics" element={<StudentTopicsPage />} />
            <Route path="student/topics/:id" element={<StudentTopicDetailPage />} />
            <Route
              path="student/topics/:id/materials/:materialId"
              element={<StudentTopicMaterialPage />}
            />
            <Route path="student/progress" element={<StudentProgressPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
