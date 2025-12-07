import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';

interface Solution {
  priority: string;
  title: string;
  description: string;
  steps: string[];
  code_examples?: string;
}

interface AIAnalysisResult {
  error_summary: string;
  root_cause: string;
  solutions: Solution[];
  related_docs?: string[];
  prevention_tips?: string[];
}

interface AIAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: AIAnalysisResult | null;
}

const getPriorityColor = (priority: string) => {
  switch (priority.toLowerCase()) {
    case 'high':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'low':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
};

const getPriorityIcon = (priority: string) => {
  switch (priority.toLowerCase()) {
    case 'high':
      return <AlertCircle className="w-5 h-5" />;
    case 'medium':
      return <Info className="w-5 h-5" />;
    case 'low':
      return <CheckCircle className="w-5 h-5" />;
    default:
      return <Info className="w-5 h-5" />;
  }
};

export function AIAnalysisModal({ isOpen, onClose, analysis }: AIAnalysisModalProps) {
  if (!isOpen || !analysis) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="max-w-4xl w-full bg-white rounded-lg shadow-xl border border-gray-200 max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">AI 배포 분석 결과</h2>
            <p className="text-sm text-gray-600 mt-1">AI가 분석한 배포 실패 원인 및 해결 방법</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* 컨텐츠 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 에러 요약 */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              에러 요약
            </h3>
            <p className="text-red-800">{analysis.error_summary}</p>
          </div>

          {/* 근본 원인 */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h3 className="font-semibold text-orange-900 mb-2">근본 원인</h3>
            <p className="text-orange-800 whitespace-pre-wrap">{analysis.root_cause}</p>
          </div>

          {/* 해결 방법 */}
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-4">해결 방법</h3>
            <div className="space-y-4">
              {analysis.solutions.map((solution, index) => (
                <div
                  key={index}
                  className={`border rounded-lg p-5 ${getPriorityColor(solution.priority)}`}
                >
                  {/* 해결책 헤더 */}
                  <div className="flex items-start gap-3 mb-3">
                    {getPriorityIcon(solution.priority)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold uppercase px-2 py-1 rounded bg-white bg-opacity-50">
                          {solution.priority}
                        </span>
                        <h4 className="font-bold text-lg">{solution.title}</h4>
                      </div>
                      <p className="text-sm mt-2">{solution.description}</p>
                    </div>
                  </div>

                  {/* 단계별 해결 방법 */}
                  <div className="mt-4 bg-white bg-opacity-50 rounded p-4">
                    <h5 className="font-semibold mb-2 text-sm">단계별 해결 방법:</h5>
                    <ol className="space-y-2">
                      {solution.steps.map((step, stepIndex) => (
                        <li key={stepIndex} className="flex gap-2 text-sm">
                          <span className="font-bold min-w-[24px]">{stepIndex + 1}.</span>
                          <span className="flex-1">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* 코드 예시 */}
                  {solution.code_examples && (
                    <div className="mt-4 bg-gray-900 text-gray-100 rounded p-4 font-mono text-sm overflow-x-auto">
                      <pre className="whitespace-pre-wrap">{solution.code_examples}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 재발 방지 팁 */}
          {analysis.prevention_tips && analysis.prevention_tips.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                재발 방지 팁
              </h3>
              <ul className="space-y-2">
                {analysis.prevention_tips.map((tip, index) => (
                  <li key={index} className="flex gap-2 text-green-800 text-sm">
                    <span className="text-green-600">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 관련 문서 */}
          {analysis.related_docs && analysis.related_docs.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-3">관련 문서</h3>
              <ul className="space-y-2">
                {analysis.related_docs.map((doc, index) => (
                  <li key={index}>
                    <a
                      href={doc}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline text-sm"
                    >
                      {doc}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="border-t border-gray-200 p-6">
          <button
            onClick={onClose}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
