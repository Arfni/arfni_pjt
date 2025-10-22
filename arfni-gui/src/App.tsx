import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardPage from "./pages/dashboard/ui/DashboardPage";
import { CanvasPage } from "./pages/canvas/ui/CanvasPage";
import TestPage from "./pages/test/ui/TestPage";
import LogPage from "./pages/logs/ui/LogPage";
import ProjectsPage from "./pages/logs/ui/ProjectsPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/canvas" element={<CanvasPage />} />
        <Route path="/test" element={<TestPage />} />
        <Route path="/logs" element={<LogPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
