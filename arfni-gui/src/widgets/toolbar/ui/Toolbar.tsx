import React from 'react';

export function Toolbar() {
  return (
    <div className="h-12 bg-gray-800 text-white flex items-center px-4 border-b border-gray-600">
      <div className="flex items-center space-x-4">
        <h1 className="text-lg font-semibold">ARFNI Canvas</h1>
        <div className="flex space-x-2">
          <button className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
            New
          </button>
          <button className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors">
            Open
          </button>
          <button className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors">
            Save
          </button>
          <button className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
            Deploy
          </button>
        </div>
      </div>
    </div>
  );
}