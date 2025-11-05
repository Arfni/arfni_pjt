import React from 'react';
import { CheckCircle } from 'lucide-react';

interface ExportSuccessNotificationProps {
  show: boolean;
  onClose: () => void;
  onOpenFolder: () => void;
}

export function ExportSuccessNotification({
  show,
  onClose,
  onOpenFolder,
}: ExportSuccessNotificationProps) {
  if (!show) return null;

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-2xl">
      <div className="bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle className="w-6 h-6" />
          <span className="font-medium text-lg">Success Export!</span>
          <button
            onClick={onOpenFolder}
            className="ml-4 underline hover:text-green-100 transition-colors font-medium"
          >
            Click here to show save folder.
          </button>
        </div>
        <button
          onClick={onClose}
          className="text-white hover:text-green-100 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
