import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Copy } from 'lucide-react';
import arfniLogo from '../../../assets/arfni_logo_white.png';

export const Titlebar = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    const checkMaximized = async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    };

    checkMaximized();

    const unlisten = appWindow.onResized(() => {
      checkMaximized();
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const handleMinimize = async () => {
    await appWindow.minimize();
  };

  const handleMaximize = async () => {
    await appWindow.toggleMaximize();
  };

  const handleClose = async () => {
    await appWindow.close();
  };

  return (
    <div
      className="h-12 flex items-center justify-between select-none border-b border-blue-600"
      style={{ backgroundColor: '#4C65E2' }}
      data-tauri-drag-region
    >
      {/* Left side - App logo and title */}
      <div className="flex items-center gap-2 px-3 text-lg text-white">
        <img src={arfniLogo} alt="ARFNI Logo" className="w-7 h-7 rounded-md" />
        <span className="font-semibold">ARFNI</span>
      </div>

      {/* Right side - Window controls */}
      <div className="flex h-full">
        <button
          onClick={handleMinimize}
          className="h-full px-4 hover:bg-blue-700 transition-colors flex items-center justify-center cursor-default"
          title="Minimize"
        >
          <Minus size={16} className="text-white" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-full px-4 hover:bg-blue-700 transition-colors flex items-center justify-center cursor-default"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <Copy size={14} className="text-white" />
          ) : (
            <Square size={14} className="text-white" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="h-full px-4 hover:bg-red-600 transition-colors flex items-center justify-center group cursor-default"
          title="Close"
        >
          <X size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
};
