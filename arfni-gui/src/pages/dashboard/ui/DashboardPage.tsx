import React, { useState } from 'react';
import { Plus, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NewProjectModal } from '@pages/settings/ui/NewProjectModal';
import { ImportModal } from '@pages/settings/ui/ImportModal';
import arfniLogo from '../../../assets/arfni_logo.png';

export default function ArfniDashboard() {
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src={arfniLogo} alt="ARFNI Logo" className="w-8 h-8 object-contain" />
          <h1 className="text-xl font-semibold">ARFNI</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Hero Section */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            그림처럼 연결하고, 클릭 한 번에 배포하세요
          </h2>
          <p className="text-sm text-gray-600 mb-1">
            복잡한 인프라를 시각적으로 설계하고, 자동으로 코드를 생성하여 원클릭 배포까지.
          </p>
          <p className="text-sm text-gray-600">
            DevOps가 이렇게 쉬울 수 있습니다.
          </p>
        </div>

        {/* Steps */}
        <div className="flex justify-center items-center gap-6 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center font-semibold text-sm">
              1
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm">설계</div>
              <div className="text-xs text-gray-600">드래그로 연결</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center font-semibold text-sm">
              2
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm">구성</div>
              <div className="text-xs text-gray-600">속성 설정</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center font-semibold text-sm">
              3
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm">배포</div>
              <div className="text-xs text-gray-600">원클릭 실행</div>
            </div>
          </div>
        </div>

        {/* Action Cards */}
        <div className="space-y-3 max-w-4xl mx-auto">
          <h3 className="text-xl font-bold text-gray-900 mb-4">시작하기</h3>

          {/* New Project Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-5 hover:border-gray-300 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Plus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-1">
                    새 프로젝트 시작
                  </h4>
                  <p className="text-sm text-gray-600">
                    빈 캔버스에서 처음부터 인프라를 설계해보세요
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNewProjectModal(true)}
                className="px-5 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm"
              >
                시작하기
              </button>
            </div>
          </div>

          {/* Import YAML Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-5 hover:border-gray-300 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-1">
                    기존 stack.yaml 불러오기
                  </h4>
                  <p className="text-sm text-gray-600">
                    이미 작성된 스택 파일을 시각화하세요
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowImportModal(true)}
                className="px-5 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                파일 선택
              </button>
            </div>
          </div>

          {/* Canvas and Test Buttons */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
              onClick={() => navigate('/canvas')}
            >
              캔버스
            </button>
            <button
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              onClick={() => navigate('/test')}
            >
              테스트
            </button>
          </div>
        </div>
        </div>
      </main>

      {/* Modals */}
      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
      />
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
      />
    </div>
  );
}