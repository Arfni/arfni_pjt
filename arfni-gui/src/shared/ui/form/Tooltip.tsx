import { useState, useRef } from 'react';
import ReactDOM from 'react-dom';

const TOOLTIP_WIDTH = 208; // w-52
const VIEWPORT_MARGIN = 12;

interface TooltipProps {
  content: string;
}

export function Tooltip({ content }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      // Center the tooltip on the icon, then clamp within viewport
      let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      if (left + TOOLTIP_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
        left = window.innerWidth - VIEWPORT_MARGIN - TOOLTIP_WIDTH;
      }
      if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
      setCoords({ top: rect.top - 8, left });
      setVisible(true);
    }
  };

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        className="cursor-help text-gray-400 hover:text-gray-600 text-xs border border-gray-300 rounded-full w-4 h-4 inline-flex items-center justify-center leading-none select-none flex-shrink-0"
      >
        ?
      </span>
      {visible &&
        ReactDOM.createPortal(
          <div
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: 'translateY(-100%)',
              zIndex: 9999,
              width: TOOLTIP_WIDTH,
            }}
            className="bg-gray-800 text-white text-xs rounded px-2 py-1.5 whitespace-normal pointer-events-none shadow-lg"
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}
