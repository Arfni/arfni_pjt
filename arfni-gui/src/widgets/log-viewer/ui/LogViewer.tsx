export function LogViewer() {
  return (
    <div className="h-full flex flex-col bg-black text-green-400 font-mono text-sm">
      <div className="p-2 border-b border-gray-600 bg-gray-800">
        <h3 className="text-white font-semibold">Deployment Logs</h3>
      </div>
      <div className="flex-1 p-2 overflow-y-auto">
        <div className="space-y-1">
          <div>[INFO] Starting deployment...</div>
          <div>[INFO] Validating stack.yaml...</div>
          <div>[INFO] Connecting to targets...</div>
          <div>[SUCCESS] All targets connected</div>
        </div>
      </div>
    </div>
  );
}