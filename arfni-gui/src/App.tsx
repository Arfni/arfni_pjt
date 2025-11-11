import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Provider as ReduxProvider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { store } from './app/store';
import { CanvasPage } from "./pages/canvas/ui/CanvasPage";
import LogPage from "./pages/logs/ui/LogPage";
import MonitoringPage from "./pages/logs/ui/MonitoringPage";
import ProjectsPage from "./pages/projects/ui/ProjectsPage";
import SettingsPage from "./pages/settings/ui/SettingsPage";
import { DeploymentPage } from "./pages/deployment/ui/DeploymentPage";
import PluginTestTutorial from "./pages/test/ui/PluginTestTutorial";
import { Titlebar } from "./widgets/titlebar/ui/Titlebar";


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
        <div className="flex flex-col h-screen">
          <Titlebar />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<ProjectsPage />} />
              <Route path="/canvas" element={<CanvasPage />} />
              <Route path="/logs" element={<LogPage />} />
              <Route path="/monitoring" element={<MonitoringPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/deployment" element={<DeploymentPage />} />
              <Route path="/plugin-test" element={<div className="flex-1 overflow-y-auto"><PluginTestTutorial /></div>} />
            </Routes>
          </BrowserRouter>
        </div>
      </QueryClientProvider>
    </ReduxProvider>
  );
}

export default App;
