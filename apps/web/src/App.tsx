import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { EditorPageRoute } from './pages/EditorPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { useAuthStore } from './store/useAuthStore';
import './App.css';

function App() {
  const token = useAuthStore((s) => s.token);
  const fallback = token ? '/projects' : '/login';

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/diagrams/:diagramId" element={<EditorPageRoute />} />
      </Route>
      <Route path="*" element={<Navigate to={fallback} replace />} />
    </Routes>
  );
}

export default App;
