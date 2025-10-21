import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    <QueryClientProvider client={queryClient}>
      <div className="h-screen w-screen">
        <CanvasPage />
      </div>
    </QueryClientProvider>
  );
}