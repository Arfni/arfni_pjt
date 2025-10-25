import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { store } from './store';
import { CanvasPage } from '@pages/canvas';
import '@app/styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <div className="h-screen w-screen">
          <CanvasPage />
        </div>
      </QueryClientProvider>
    </ReduxProvider>
  );
}