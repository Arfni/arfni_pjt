import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  BarChart3,
  AlertTriangle,
  Cpu,
  Database,
  TrendingDown
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface OptimizeViewProps {
  prometheusUrl?: string;
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

export function OptimizeView({ prometheusUrl = 'http://localhost:9090' }: OptimizeViewProps) {
  const { t } = useTranslation('logs');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizationReport | null>(null);

  const handleOptimize = async () => {
    setResult(null);
    setLoading(true);
    setError(null);

    try {
      const report = await invoke<OptimizationReport>('optimize', {
        prometheusUrl,
      });
      setResult(report);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

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
    <div className="flex-1 bg-white overflow-hidden flex flex-col">
      {/* Scrollable Content Area */}
      <div className={`flex-1 overflow-y-auto ${(!result && !error) || loading ? 'flex items-center justify-center' : 'p-6'}`}>
        {!result && !loading && !error && (
          <div className="text-center">
            <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              {t('optimize.startAnalysis')}
            </h3>
            <p className="text-gray-500 mb-6">
              {t('optimize.description')}
            </p>
            <button
              onClick={handleOptimize}
              className="text-white px-6 py-3 rounded-lg font-medium transition-colors"
              style={{ backgroundColor: '#4C65E2' }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              {t('optimize.startButton')}
            </button>
          </div>
        )}

        {loading && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 mx-auto mb-4" style={{ borderBottomColor: '#4C65E2' }}></div>
            <p className="text-gray-600">{t('optimize.analyzing')}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-red-800 mb-1">{t('optimize.analysisFailed')}</h4>
                <p className="text-red-700 text-sm whitespace-pre-wrap">{error}</p>
                <button
                  onClick={handleOptimize}
                  className="mt-3 text-red-700 hover:text-red-800 font-medium text-sm underline"
                >
                  {t('optimize.retry')}
                </button>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-6">
            {/* Title Section */}
            <div className="mb-2 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">{t('optimize.title')}</h2>
                <p className="text-gray-600">
                  {t('optimize.aiRecommendations')}
                </p>
              </div>
              <button
                onClick={handleOptimize}
                disabled={loading}
                className="text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex-shrink-0"
                style={{ backgroundColor: '#4C65E2' }}
                onMouseEnter={(e) => !loading && (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => !loading && (e.currentTarget.style.opacity = '1')}
              >
                {t('optimize.reanalyze')}
              </button>
            </div>

            {/* Glossary Section */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                📖 {t('optimize.glossary.title')}
              </h4>
              <div className="grid md:grid-cols-3 gap-3 text-sm text-blue-700">
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <div className="font-semibold text-blue-900 mb-1">{t('optimize.glossary.p50Title')}</div>
                  <div className="text-xs">{t('optimize.glossary.p50Description')}</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <div className="font-semibold text-blue-900 mb-1">{t('optimize.glossary.p95Title')}</div>
                  <div className="text-xs">{t('optimize.glossary.p95Description')}</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <div className="font-semibold text-blue-900 mb-1">{t('optimize.glossary.p99Title')}</div>
                  <div className="text-xs">{t('optimize.glossary.p99Description')}</div>
                </div>
              </div>
            </div>

            {/* Actual Usage Section */}
            <div className="bg-gray-50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-purple-600" />
                  {t('optimize.actualUsage.title')}
                </h3>
                <div className="bg-purple-600 text-white px-4 py-1.5 rounded-full text-sm font-semibold shadow-sm">
                  {result.actual_usage.instance_type || result.cost_analysis.current_instance_type}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-sm text-gray-500 mb-1">{t('optimize.actualUsage.cpu')}</div>
                  <div className="text-2xl font-bold text-gray-800">
                    {result.actual_usage.cpu_usage_percent.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-sm text-gray-500 mb-1">{t('optimize.actualUsage.memory')}</div>
                  <div className="text-2xl font-bold text-gray-800">
                    {result.actual_usage.memory_usage_percent.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">
                    {result.actual_usage.memory_used_mb.toFixed(0)} MB
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-sm text-gray-500 mb-1">{t('optimize.actualUsage.disk')}</div>
                  <div className="text-2xl font-bold text-gray-800">
                    {result.actual_usage.disk_usage_percent.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">
                    {result.actual_usage.disk_used_gb.toFixed(1)} GB
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-sm text-gray-500 mb-1">{t('optimize.actualUsage.health')}</div>
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
                  {t('optimize.costSavings.title')}
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-green-700 mb-1">{t('optimize.costSavings.currentCost')}</div>
                    <div className="text-3xl font-bold text-green-900">
                      ${result.cost_analysis.current_monthly_cost.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-green-700 mb-1">{t('optimize.costSavings.potentialSavings')}</div>
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
                  {t('optimize.bottlenecks.title')}
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
                {t('optimize.recommendations.title')}
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
                            <div className="text-xs opacity-75">{t('optimize.recommendations.savings')}</div>
                            <div className="text-xl font-bold">
                              ${rec.savings.toFixed(2)}
                            </div>
                            <div className="text-xs opacity-75">{t('optimize.recommendations.perMonth')}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
