import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Batches from './pages/admin/Batches';
import Students from './pages/admin/Students';
import Teachers from './pages/admin/Teachers';
import Resources from './pages/admin/Resources';
import MarksAssessments from './pages/teacher/MarksAssessments';
import TeacherQuizzes from './pages/teacher/Quizzes';
import TeacherPassword from './pages/teacher/ChangePassword';
import Subjects from './pages/student/Subjects';
import SubjectMarks from './pages/student/SubjectMarks';
import StudentQuizzes from './pages/student/Quizzes';
import TakeQuiz from './pages/student/TakeQuiz';
import StudentPassword from './pages/student/ChangePassword';
import ResourceCenter from './pages/resources/ResourceCenter';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/resources" element={<ResourceCenter />} />

            {/* Admin routes */}
            <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><Layout /></ProtectedRoute>}>
              <Route index element={<Navigate to="batches" replace />} />
              <Route path="batches" element={<Batches />} />
              <Route path="students" element={<Students />} />
              <Route path="teachers" element={<Teachers />} />
              <Route path="resources" element={<Resources />} />
            </Route>

            {/* Teacher routes */}
            <Route path="/teacher" element={<ProtectedRoute allowedRoles={['teacher']}><Layout /></ProtectedRoute>}>
              <Route index element={<Navigate to="marks" replace />} />
              <Route path="marks" element={<MarksAssessments />} />
              <Route path="quizzes" element={<TeacherQuizzes />} />
              <Route path="password" element={<TeacherPassword />} />
            </Route>

            {/* Student routes */}
            <Route path="/student" element={<ProtectedRoute allowedRoles={['student']}><Layout /></ProtectedRoute>}>
              <Route index element={<Navigate to="subjects" replace />} />
              <Route path="subjects" element={<Subjects />} />
              <Route path="subjects/:subjectId" element={<SubjectMarks />} />
              <Route path="quizzes" element={<StudentQuizzes />} />
              <Route path="quizzes/:quizId" element={<TakeQuiz />} />
              <Route path="password" element={<StudentPassword />} />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
