import React from 'react';

interface ExportDialogProps {
  show: boolean;
  onClose: () => void;
  selectedFormat: 'png' | 'svg' | 'pdf';
  onFormatChange: (format: 'png' | 'svg' | 'pdf') => void;
  onConfirm: () => void;
}

export function ExportDialog({
  show,
  onClose,
  selectedFormat,
  onFormatChange,
  onConfirm,
}: ExportDialogProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 w-[500px]">
        <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Export Image</h2>
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-gray-700 mb-4">File Format</h3>
          <div className="flex gap-2">
            <button
              onClick={() => onFormatChange('png')}
              className={`flex-1 py-4 px-6 rounded-lg font-semibold text-lg transition-all ${
                selectedFormat === 'png'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              PNG
            </button>
            <button
              onClick={() => onFormatChange('svg')}
              className={`flex-1 py-4 px-6 rounded-lg font-semibold text-lg transition-all ${
                selectedFormat === 'svg'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              SVG
            </button>
            <button
              onClick={() => onFormatChange('pdf')}
              className={`flex-1 py-4 px-6 rounded-lg font-semibold text-lg transition-all ${
                selectedFormat === 'pdf'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              PDF
            </button>
          </div>
        </div>

        <div className="text-sm font-bold text-red-600 mb-6">* It will be captured according to the minimap. Please check that all blocks are included in the minimap before exporting.</div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors font-medium"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
