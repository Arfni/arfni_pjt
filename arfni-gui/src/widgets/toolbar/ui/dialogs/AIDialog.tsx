import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import rabbitImg from '../../../../assets/rabbit.png';
import { BeatLoader } from 'react-spinners';

interface AIDialogProps {
  show: boolean;
  onClose: () => void;
  currentProject: any;
}

interface CostItem {
  name: string;
  instance_type: string;
  count: number;
  unit_price: number;
  total_price: number;
  description: string;
}

interface CostDetails {
  ec2_items: CostItem[];
  rds_items: CostItem[];
  cache_items: CostItem[];
  storage_items: CostItem[];
}

interface TierCostBreakdown {
  tier_name: string;
  description: string;
  instance_type: string;
  total_monthly_usd: number;
  ec2_cost: number;
  storage_cost: number;
  data_transfer_cost: number;
  warnings: string[];
  details: CostDetails;
}

interface CostEstimationResult {
  budget_tier: TierCostBreakdown;
  recommended_tier: TierCostBreakdown;
  performance_tier: TierCostBreakdown;
  optimization_tips: string[];
}

export function AIDialog({ show, onClose, currentProject }: AIDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CostEstimationResult | null>(null);

  const handleAskRabbit = async () => {
    if (!currentProject?.path) {
      setError('No project selected');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const stackPath = `${currentProject.path}\\stack.yaml`;

      const estimateResult = await invoke<CostEstimationResult>('estimate_cost', {
        stackPath,
      });

      setResult(estimateResult);
    } catch (err) {
      console.error('Estimate error:', err);
      const errorMessage = err as string;

      // 빈 캔버스 또는 서비스 없음 에러 처리
      if (errorMessage.includes('no services defined') ||
          errorMessage.includes('services not found') ||
          errorMessage.includes('empty stack')) {
        setError('캔버스가 비어있습니다. 비용 예측을 사용하려면 먼저 서비스를 추가해주세요.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[900px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">AI-powered server cost prediction</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - 스크롤 가능 */}
        <div className="p-10 overflow-y-auto">
          {/* Top section: Title, Button, and Rabbit */}
          <div className="flex gap-6 mb-8">
            {/* Left side - Title and Form */}
            <div className="flex-1 space-y-6">
              

              {/* Ask the Rabbit button */}
              

              <div className="text-sm text-gray-600 p-4 rounded-lg border border-gray-300 flex gap-4 items-center">
                <div className="flex-1">
                  <p className="font-semibold mb-2">AI가 분석하는 내용:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>stack.yaml의 서비스 구성 분석</li>
                    <li>최소 메모리 요구사항 추정</li>
                    <li>벤치마크 데이터 기반 운영 안정성 평가</li>
                    <li>Budget/Recommended/Performance 3단계 추천</li>
                    <li>서울 리전 기반 월간 비용 계산</li>
                  </ul>
                </div>
                <div className="flex-shrink-0">
                  <img
                    src={rabbitImg}
                    alt="Rabbit"
                    className="w-40 h-40 object-contain"
                  />
                </div>
              </div>

              <button
                onClick={handleAskRabbit}
                disabled={loading}
                className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-lg font-semibold"
              >
                {loading ? 'Analyzing your project...' : 'Analyze Project & Recommend Server'}
              </button>

              {/* Loading spinner */}
              {loading && (
                <div className="flex justify-center py-4">
                  <BeatLoader color="#3b82f6" size={15} />
                </div>
              )}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 rounded-lg border border-red-200">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* AI Response - Full width below */}
          {result && (
            <div className="space-y-4">
                  {/* Recommended Tier */}
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="font-semibold text-blue-900 mb-2">
                      💡 Recommended: {result.recommended_tier.tier_name}
                    </h4>
                    <div className="mb-2 px-2 py-1 bg-blue-100 rounded inline-block">
                      <span className="text-xs font-mono text-blue-800">{result.recommended_tier.instance_type}</span>
                    </div>
                    {result.recommended_tier.details?.ec2_items?.[0]?.description && (
                      <div className="mb-2 p-2 bg-white rounded border border-blue-200">
                        <p className="text-xs text-gray-800 leading-relaxed">
                          <span className="font-semibold text-blue-800">선택 이유:</span> {result.recommended_tier.details.ec2_items[0].description}
                        </p>
                      </div>
                    )}
                    <p className="text-sm text-gray-700 mb-3">{result.recommended_tier.description}</p>
                    <div className="text-2xl font-bold text-blue-600 mb-3">
                      ${result.recommended_tier.total_monthly_usd.toFixed(2)}/month
                    </div>
                    <div className="text-xs text-gray-700 space-y-2 bg-white p-2 rounded border border-blue-100">
                      <div className="font-semibold text-blue-900">월간 비용 상세:</div>
                      {result.recommended_tier.details?.ec2_items?.map((item, idx) => (
                        <div key={idx} className="pl-2">
                          • {item.instance_type} 인스턴스 (730시간): ${item.total_price.toFixed(2)}
                        </div>
                      ))}
                      {result.recommended_tier.details?.storage_items?.filter(item => item.name.includes('Storage')).map((item, idx) => (
                        <div key={idx} className="pl-2">
                          • EBS 스토리지 {item.count}GB: ${item.total_price.toFixed(2)}
                        </div>
                      ))}
                      {result.recommended_tier.data_transfer_cost > 0 && (
                        <div className="pl-2">
                          • 데이터 전송 (예상): ${result.recommended_tier.data_transfer_cost.toFixed(2)}
                        </div>
                      )}
                    </div>
                    {result.recommended_tier.warnings.length > 0 && (
                      <div className="mt-2 text-xs text-orange-600">
                        {result.recommended_tier.warnings.map((warning, idx) => (
                          <div key={idx}>⚠️ {warning}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Budget Tier */}
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <h4 className="font-semibold text-gray-800 mb-1 text-sm">
                      Budget Option: {result.budget_tier.tier_name}
                    </h4>
                    <div className="mb-1 px-2 py-1 bg-gray-200 rounded inline-block">
                      <span className="text-xs font-mono text-gray-700">{result.budget_tier.instance_type}</span>
                    </div>
                    {result.budget_tier.details?.ec2_items?.[0]?.description && (
                      <div className="mb-1 p-2 bg-white rounded border border-gray-300">
                        <p className="text-xs text-gray-700 leading-relaxed">
                          <span className="font-semibold">선택 이유:</span> {result.budget_tier.details.ec2_items[0].description}
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-gray-600 mb-2">{result.budget_tier.description}</p>
                    <div className="text-lg font-bold text-gray-700 mb-2">
                      ${result.budget_tier.total_monthly_usd.toFixed(2)}/month
                    </div>
                    <div className="text-xs text-gray-600 space-y-1 bg-white p-2 rounded border border-gray-200">
                      <div className="font-semibold">월간 비용 상세:</div>
                      {result.budget_tier.details?.ec2_items?.map((item, idx) => (
                        <div key={idx} className="pl-2">
                          • {item.instance_type} 인스턴스: ${item.total_price.toFixed(2)}
                        </div>
                      ))}
                      {result.budget_tier.details?.storage_items?.filter(item => item.name.includes('Storage')).map((item, idx) => (
                        <div key={idx} className="pl-2">
                          • EBS 스토리지 {item.count}GB: ${item.total_price.toFixed(2)}
                        </div>
                      ))}
                      {result.budget_tier.data_transfer_cost > 0 && (
                        <div className="pl-2">• 데이터 전송 (예상): ${result.budget_tier.data_transfer_cost.toFixed(2)}</div>
                      )}
                    </div>
                    {result.budget_tier.warnings.length > 0 && (
                      <div className="mt-1 text-xs text-orange-600">
                        {result.budget_tier.warnings.map((warning, idx) => (
                          <div key={idx}>⚠️ {warning}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Performance Tier */}
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <h4 className="font-semibold text-gray-800 mb-1 text-sm">
                      Performance Option: {result.performance_tier.tier_name}
                    </h4>
                    <div className="mb-1 px-2 py-1 bg-gray-200 rounded inline-block">
                      <span className="text-xs font-mono text-gray-700">{result.performance_tier.instance_type}</span>
                    </div>
                    {result.performance_tier.details?.ec2_items?.[0]?.description && (
                      <div className="mb-1 p-2 bg-white rounded border border-gray-300">
                        <p className="text-xs text-gray-700 leading-relaxed">
                          <span className="font-semibold">선택 이유:</span> {result.performance_tier.details.ec2_items[0].description}
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-gray-600 mb-2">{result.performance_tier.description}</p>
                    <div className="text-lg font-bold text-gray-700 mb-2">
                      ${result.performance_tier.total_monthly_usd.toFixed(2)}/month
                    </div>
                    <div className="text-xs text-gray-600 space-y-1 bg-white p-2 rounded border border-gray-200">
                      <div className="font-semibold">월간 비용 상세:</div>
                      {result.performance_tier.details?.ec2_items?.map((item, idx) => (
                        <div key={idx} className="pl-2">
                          • {item.instance_type} 인스턴스: ${item.total_price.toFixed(2)}
                        </div>
                      ))}
                      {result.performance_tier.details?.storage_items?.filter(item => item.name.includes('Storage')).map((item, idx) => (
                        <div key={idx} className="pl-2">
                          • EBS 스토리지 {item.count}GB: ${item.total_price.toFixed(2)}
                        </div>
                      ))}
                      {result.performance_tier.data_transfer_cost > 0 && (
                        <div className="pl-2">• 데이터 전송 (예상): ${result.performance_tier.data_transfer_cost.toFixed(2)}</div>
                      )}
                    </div>
                  </div>

                  {/* Optimization Tips */}
                  {result.optimization_tips.length > 0 && (
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <h4 className="font-semibold text-green-900 mb-2 text-sm">Tips:</h4>
                      <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                        {result.optimization_tips.map((tip, idx) => (
                          <li key={idx}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
        </div>
      </div>
    </div>
  );
}
