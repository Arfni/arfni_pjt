import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Provider as ReduxProvider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { store } from './app/store';
import DashboardPage from "./pages/dashboard/ui/DashboardPage";
import { CanvasPage } from "./pages/canvas/ui/CanvasPage";
import TestPage from "./pages/test/ui/TestPage";
import LogPage from "./pages/logs/ui/LogPage";
import ProjectsPage from "./pages/logs/ui/ProjectsPage";
import TestPage2 from "./pages/test/ui/TestPage2";
import { DeploymentPage } from "./pages/deployment/ui/DeploymentPage";
import SshTerminal from "./pages/test/ui/SshTerminal";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/canvas" element={<CanvasPage />} />
            <Route path="/test" element={<TestPage />} />
            <Route path="/logs" element={<LogPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/test2" element={<TestPage2 />} />
            <Route path="/deployment" element={<DeploymentPage />} />
            <Route path="/test2" element={<TestPage2 />} />
            <Route path="/test3" element={<SshTerminal />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ReduxProvider>
  );
}

export default App;
