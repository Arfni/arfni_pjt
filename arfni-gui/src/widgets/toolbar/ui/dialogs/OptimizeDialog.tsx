import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import {
  X,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Cpu,
  Database,
  TrendingDown
} from 'lucide-react';

interface OptimizeDialogProps {
  show: boolean;
  onClose: () => void;
  prometheusUrl?: string; // Optional prometheus URL (default: localhost:9090)
}

interface ActualUsageMetrics {
  cpu_usage_percent: number;
  memory_used_mb: number;
  memory_usage_percent: number;
  disk_used_gb: number;
  disk_usage_percent: number;
  network_inbound_mb_24h: number;
  network_outbound_mb_24h: number;
  instance_type: string;
}

interface CostAnalysis {
  current_instance_type: string;
  current_monthly_cost: number;
  estimated_data_transfer_cost: number;
  actual_data_transfer_cost: number;
  potential_savings: number;
  savings_percent: number;
}

interface PerformanceAnalysis {
  cpu_bottleneck: boolean;
  memory_bottleneck: boolean;
  disk_bottleneck: boolean;
  bottlenecks: string[];
  health_status: string;
}

interface Recommendation {
  priority: string;
  category: string;
  title: string;
  description: string;
  impact: string;
  savings?: number;
}

interface OptimizationReport {
  actual_usage: ActualUsageMetrics;
  cost_analysis: CostAnalysis;
  performance_analysis: PerformanceAnalysis;
  recommendations: Recommendation[];
}

export function OptimizeDialog({ show, onClose, prometheusUrl = 'http://localhost:9090' }: OptimizeDialogProps) {
  const { i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizationReport | null>(null);

  const handleOptimize = async () => {
    setLoading(true);
    setError(null);

    try {
      const currentLanguage = i18n.language;
      console.log('[OptimizeDialog] Current language from i18n:', currentLanguage);

      // Normalize language code (ko-KR -> ko, en-US -> en)
      const languageCode = currentLanguage.split('-')[0];
      console.log('[OptimizeDialog] Normalized language code:', languageCode);

      // Debug: Show alert to confirm language
      alert(`Language: ${currentLanguage}, Normalized: ${languageCode}`);

      const report = await invoke<OptimizationReport>('optimize', {
        prometheusUrl,
        language: languageCode,
      });
      setResult(report);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'critical':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">서버 최적화 분석</h2>
                <p className="text-purple-100 text-sm mt-1">
                  실제 사용 메트릭 기반 AI 추천
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {!result && !loading && !error && (
            <div className="text-center py-12">
              <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                서버 최적화 분석을 시작하세요
              </h3>
              <p className="text-gray-500 mb-6">
                Prometheus 메트릭을 분석하여 비용 절감 및 성능 개선 방안을 제안합니다
              </p>
              <button
                onClick={handleOptimize}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                [TEST] 분석 시작
              </button>
            </div>
          )}

          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4"></div>
              <p className="text-gray-600">메트릭을 수집하고 분석 중입니다...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-red-800 mb-1">분석 실패</h4>
                  <p className="text-red-700 text-sm whitespace-pre-wrap">{error}</p>
                  <button
                    onClick={handleOptimize}
                    className="mt-3 text-red-700 hover:text-red-800 font-medium text-sm underline"
                  >
                    다시 시도
                  </button>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-6">
              {/* Glossary Section */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                  📖 용어 설명
                </h4>
                <div className="grid md:grid-cols-3 gap-3 text-sm text-blue-700">
                  <div className="bg-white rounded-lg p-3 border border-blue-100">
                    <div className="font-semibold text-blue-900 mb-1">P50 (중앙값)</div>
                    <div className="text-xs">절반의 시간 동안 이 값 이하로 사용합니다. 일반적인 사용량을 나타냅니다.</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-blue-100">
                    <div className="font-semibold text-blue-900 mb-1">P95</div>
                    <div className="text-xs">95%의 시간 동안 이 값 이하로 유지됩니다. 일반적인 피크 수준을 나타냅니다.</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-blue-100">
                    <div className="font-semibold text-blue-900 mb-1">P99</div>
                    <div className="text-xs">99%의 시간 동안 이 값 이하입니다. 극단적인 피크 상황을 제외한 최대치입니다.</div>
                  </div>
                </div>
              </div>

              {/* Actual Usage Section */}
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-purple-600" />
                    실제 리소스 사용량
                  </h3>
                  <div className="bg-purple-600 text-white px-4 py-1.5 rounded-full text-sm font-semibold shadow-sm">
                    {result.actual_usage.instance_type || result.cost_analysis.current_instance_type}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-500 mb-1">CPU</div>
                    <div className="text-2xl font-bold text-gray-800">
                      {result.actual_usage.cpu_usage_percent.toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-500 mb-1">Memory</div>
                    <div className="text-2xl font-bold text-gray-800">
                      {result.actual_usage.memory_usage_percent.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500">
                      {result.actual_usage.memory_used_mb.toFixed(0)} MB
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-500 mb-1">Disk</div>
                    <div className="text-2xl font-bold text-gray-800">
                      {result.actual_usage.disk_usage_percent.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500">
                      {result.actual_usage.disk_used_gb.toFixed(1)} GB
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-500 mb-1">Health</div>
                    <div className={`text-xl font-bold ${getHealthStatusColor(result.performance_analysis.health_status)}`}>
                      {result.performance_analysis.health_status.toUpperCase()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Cost Analysis */}
              {result.cost_analysis.potential_savings > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-green-800">
                    <TrendingDown className="w-5 h-5" />
                    비용 절감 기회
                  </h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-green-700 mb-1">현재 월 비용</div>
                      <div className="text-3xl font-bold text-green-900">
                        ${result.cost_analysis.current_monthly_cost.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-green-700 mb-1">절감 가능 금액</div>
                      <div className="text-3xl font-bold text-green-600">
                        ${result.cost_analysis.potential_savings.toFixed(2)}
                        <span className="text-lg ml-2">
                          ({result.cost_analysis.savings_percent.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Performance Bottlenecks */}
              {result.performance_analysis.bottlenecks.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-red-800">
                    <AlertTriangle className="w-5 h-5" />
                    성능 병목 현상
                  </h3>
                  <ul className="space-y-2">
                    {result.performance_analysis.bottlenecks.map((bottleneck, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-red-700">
                        <span className="text-red-500">•</span>
                        {bottleneck}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Database className="w-5 h-5 text-purple-600" />
                  AI 추천사항
                </h3>
                <div className="space-y-3">
                  {result.recommendations
                    .sort((a, b) => {
                      const priorityOrder = { high: 0, medium: 1, low: 2 };
                      return priorityOrder[a.priority as keyof typeof priorityOrder] -
                             priorityOrder[b.priority as keyof typeof priorityOrder];
                    })
                    .map((rec, idx) => (
                      <div
                        key={idx}
                        className={`border rounded-lg p-4 ${getPriorityColor(rec.priority)}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-semibold uppercase px-2 py-1 rounded bg-white/50">
                                {rec.priority}
                              </span>
                              <span className="text-xs font-medium uppercase px-2 py-1 rounded bg-white/50">
                                {rec.category}
                              </span>
                            </div>
                            <h4 className="font-semibold mb-2">{rec.title}</h4>
                            <p className="text-sm mb-2 opacity-90">{rec.description}</p>
                            <p className="text-sm font-medium">
                              💡 {rec.impact}
                            </p>
                          </div>
                          {rec.savings && rec.savings > 0 && (
                            <div className="text-right flex-shrink-0">
                              <div className="text-xs opacity-75">절감액</div>
                              <div className="text-xl font-bold">
                                ${rec.savings.toFixed(2)}
                              </div>
                              <div className="text-xs opacity-75">/ 월</div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Re-analyze Button */}
              <div className="text-center pt-4">
                <button
                  onClick={handleOptimize}
                  disabled={loading}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  다시 분석
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
