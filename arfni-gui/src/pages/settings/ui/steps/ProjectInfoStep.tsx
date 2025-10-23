import { FolderOpen } from 'lucide-react';

interface ProjectInfoStepProps {
  projectName: string;
  setProjectName: (value: string) => void;
  workingDirectory: string;
  setWorkingDirectory: (value: string) => void;
  onNext: () => void;
  onClose: () => void;
}

export function ProjectInfoStep({
  projectName,
  setProjectName,
  workingDirectory,
  setWorkingDirectory,
  onNext,
  onClose,
}: ProjectInfoStepProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  const handleBrowseDirectory = () => {
    // TODO: 디렉토리 선택 다이얼로그 (Tauri API 사용)
    console.log('디렉토리 선택');
  };

  return (
    <>
      <h3 className="text-2xl font-bold mb-6">새 프로젝트 생성</h3>
      <p className="text-gray-600 mb-6">프로젝트 기본 정보</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 프로젝트 이름 */}
        <div>
          <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 mb-2">
            프로젝트 이름 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="projectName"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="예: my-infra-project"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
            required
          />
        </div>

        {/* 작업 디렉토리 경로 */}
        <div>
          <label htmlFor="workingDirectory" className="block text-sm font-medium text-gray-700 mb-2">
            작업 디렉토리 경로 <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              id="workingDirectory"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="예: C:\Projects\my-project"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
              required
            />
            <button
              type="button"
              onClick={handleBrowseDirectory}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <FolderOpen className="w-4 h-4" />
              찾아보기
            </button>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-3 justify-end pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            이전
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
          >
            다음
          </button>
        </div>
      </form>
    </>
  );
}
