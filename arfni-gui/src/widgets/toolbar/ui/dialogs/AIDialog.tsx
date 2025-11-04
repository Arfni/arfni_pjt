import React, { useState } from 'react';
import rabbitImg from '../../../../assets/rabbit.png';

interface AIDialogProps {
  show: boolean;
  onClose: () => void;
}

export function AIDialog({ show, onClose }: AIDialogProps) {
  const [expectedUsers, setExpectedUsers] = useState('');
  const [expectedTraffic, setExpectedTraffic] = useState<'low' | 'medium' | 'high'>('medium');

  const handleAskRabbit = () => {
    // TODO: AI 로직 구현
    console.log('Ask the Rabbit:', { expectedUsers, expectedTraffic });
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">AI</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-10">
          <h3 className="text-lg font-medium text-gray-800 mb-8">
            Which server should I use for this project structure?
          </h3>

          <div className="flex gap-12">
            {/* Left side - Form */}
            <div className="flex-1 space-y-8">
              {/* Expected number of users */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Expected number of users
                </label>
                <input
                  type="number"
                  value={expectedUsers}
                  onChange={(e) => setExpectedUsers(e.target.value)}
                  placeholder="300"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Expected traffic */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Expected traffic
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setExpectedTraffic('low')}
                    className={`flex-1 px-4 py-2 rounded-lg border transition-colors ${
                      expectedTraffic === 'low'
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Low
                  </button>
                  <button
                    onClick={() => setExpectedTraffic('medium')}
                    className={`flex-1 px-4 py-2 rounded-lg border transition-colors ${
                      expectedTraffic === 'medium'
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Medium
                  </button>
                  <button
                    onClick={() => setExpectedTraffic('high')}
                    className={`flex-1 px-4 py-2 rounded-lg border transition-colors ${
                      expectedTraffic === 'high'
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    High
                  </button>
                </div>
              </div>

              {/* Ask the Rabbit button */}
              <button
                onClick={handleAskRabbit}
                className="w-full px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Ask the Rabbit
              </button>
            </div>

            {/* Right side - Rabbit image */}
            <div className="flex items-center justify-center">
              <img
                src={rabbitImg}
                alt="Rabbit"
                className="w-48 h-48 object-contain"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
