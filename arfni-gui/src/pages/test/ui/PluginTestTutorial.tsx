import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/ui/Button/Button";
import { pluginCommands } from "@shared/api/tauri/commands";
import { open } from "@tauri-apps/plugin-dialog";
import { pluginService } from "@services/pluginLoader";
import { useTranslation } from "react-i18next";

export default function PluginTestTutorial() {
  const navigate = useNavigate();
  const { t } = useTranslation(['projects', 'test']);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [activeSection, setActiveSection] = useState<'guide' | 'checklist' | 'issues' | 'import'>('guide');
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [importStatus, setImportStatus] = useState<{type: 'success' | 'error' | null, message: string}>({type: null, message: ""});

  const toggleStep = (step: number) => {
    setCompletedSteps(prev =>
      prev.includes(step) ? prev.filter(s => s !== step) : [...prev, step]
    );
  };

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('plugins.custom.selectFolder'),
      });

      if (selected && typeof selected === 'string') {
        setSelectedFolder(selected);
        setImportStatus({type: null, message: ""});
      }
    } catch (error) {
      console.error("폴더 선택 실패:", error);
      setImportStatus({type: 'error', message: t('plugins.custom.errors.selectFailed')});
    }
  };

  const handleImportPlugin = async () => {
    if (!selectedFolder) {
      setImportStatus({type: 'error', message: t('plugins.custom.errors.noFolder')});
      return;
    }

    try {
      const result = await pluginCommands.importCustomPlugin(selectedFolder);
      setImportStatus({type: 'success', message: result});
      setSelectedFolder("");

      // Reload plugins to reflect the new custom plugin
      await pluginService.reloadPlugins();
    } catch (error) {
      console.error("플러그인 가져오기 실패:", error);
      setImportStatus({type: 'error', message: String(error)});
    }
  };

  const steps = [
    {
      id: 1,
      title: t('test:pluginTutorial.steps.step1.title'),
      description: t('test:pluginTutorial.steps.step1.description'),
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {t('test:pluginTutorial.steps.step1.intro')}
          </p>

          <div>
            <h4 className="font-semibold text-sm mb-2 text-gray-900">{t('test:pluginTutorial.steps.step1.folderStructure')}</h4>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
              <div>my-plugin/</div>
              <div className="ml-4">├── plugin.yaml</div>
              <div className="ml-4">├── icon.png</div>
              <div className="ml-4">├── README.md</div>
              <div className="ml-4">├── templates/</div>
              <div className="ml-8">│   └── docker-compose.yml</div>
              <div className="ml-4">├── hooks/</div>
              <div className="ml-8">│   ├── pre-deploy.sh</div>
              <div className="ml-8">│   └── post-deploy.sh</div>
              <div className="ml-4">└── frameworks/</div>
              <div className="ml-8">    └── myframework.yaml</div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-2 text-gray-900">{t('test:pluginTutorial.steps.step1.requiredFiles')}</h4>
            <div className="text-sm text-gray-600 space-y-1 ml-4">
              <div>• {t('test:pluginTutorial.steps.step1.requiredList.item1')}</div>
              <div>• {t('test:pluginTutorial.steps.step1.requiredList.item2')}</div>
              <div>• {t('test:pluginTutorial.steps.step1.requiredList.item3')}</div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-2 text-gray-900">{t('test:pluginTutorial.steps.step1.optionalFiles')}</h4>
            <div className="text-sm text-gray-600 space-y-1 ml-4">
              <div>• {t('test:pluginTutorial.steps.step1.optionalList.item1')}</div>
              <div>• {t('test:pluginTutorial.steps.step1.optionalList.item2')}</div>
              <div>• {t('test:pluginTutorial.steps.step1.optionalList.item3')}</div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="text-yellow-800 text-sm">
              {t('test:pluginTutorial.steps.step1.yamlNote')}
            </div>
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: t('test:pluginTutorial.steps.step2.title'),
      description: t('test:pluginTutorial.steps.step2.description'),
      content: (
        <div className="space-y-4">
          <div className="text-sm text-gray-600 space-y-2">
            <div>{t('test:pluginTutorial.steps.step2.step1')}</div>
            <div>{t('test:pluginTutorial.steps.step2.step2')}</div>
            <div>{t('test:pluginTutorial.steps.step2.step3')}</div>
            <div>{t('test:pluginTutorial.steps.step2.step4')}</div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-blue-800 text-sm">
              {t('test:pluginTutorial.steps.step2.note')}
            </div>
          </div>
        </div>
      )
    },
    {
      id: 3,
      title: t('test:pluginTutorial.steps.step3.title'),
      description: t('test:pluginTutorial.steps.step3.description'),
      content: (
        <div className="space-y-4">
          <div className="text-sm text-gray-600 space-y-2">
            <div>{t('test:pluginTutorial.steps.step3.step1')}</div>
            <div>{t('test:pluginTutorial.steps.step3.step2')}</div>
            <div>{t('test:pluginTutorial.steps.step3.step3')}</div>
            <div>{t('test:pluginTutorial.steps.step3.step4')}</div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-green-800 text-sm">
              {t('test:pluginTutorial.steps.step3.tip')}
            </div>
          </div>
        </div>
      )
    },
    {
      id: 4,
      title: t('test:pluginTutorial.steps.step4.title'),
      description: t('test:pluginTutorial.steps.step4.description'),
      content: (
        <div className="space-y-4">
          <div className="text-sm text-gray-600 space-y-2">
            <div>{t('test:pluginTutorial.steps.step4.step1')}</div>
            <div>{t('test:pluginTutorial.steps.step4.step2')}</div>
            <div>{t('test:pluginTutorial.steps.step4.step3')}</div>
            <div>{t('test:pluginTutorial.steps.step4.step4')}</div>
            <div>{t('test:pluginTutorial.steps.step4.step5')}</div>
            <div>{t('test:pluginTutorial.steps.step4.step6')}</div>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="text-purple-800 text-sm">
              {t('test:pluginTutorial.steps.step4.tip')}
            </div>
          </div>
        </div>
      )
    },
    {
      id: 5,
      title: t('test:pluginTutorial.steps.step5.title'),
      description: t('test:pluginTutorial.steps.step5.description'),
      content: (
        <div className="space-y-4">
          <div className="text-sm text-gray-600 space-y-2">
            <div>{t('test:pluginTutorial.steps.step5.step1')}</div>
            <div>{t('test:pluginTutorial.steps.step5.step2')}</div>
            <div>{t('test:pluginTutorial.steps.step5.step3')}</div>
            <div>{t('test:pluginTutorial.steps.step5.step4')}</div>
            <div>{t('test:pluginTutorial.steps.step5.step5')}</div>
            <div>{t('test:pluginTutorial.steps.step5.step6')}</div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-red-800 text-sm">
              {t('test:pluginTutorial.steps.step5.errorCheck')}
            </div>
          </div>
        </div>
      )
    },
    {
      id: 6,
      title: t('test:pluginTutorial.steps.step6.title'),
      description: t('test:pluginTutorial.steps.step6.description'),
      content: (
        <div className="space-y-4">
          <div className="text-sm text-gray-600 space-y-2">
            <div>{t('test:pluginTutorial.steps.step6.steps.fork')}</div>
            <div>{t('test:pluginTutorial.steps.step6.steps.addPlugin')}</div>
            <div>{t('test:pluginTutorial.steps.step6.steps.updateReadme')}</div>
            <div>{t('test:pluginTutorial.steps.step6.steps.createPR')}</div>
            <div className="ml-4 space-y-1">
              <div>{t('test:pluginTutorial.steps.step6.steps.prItems.description')}</div>
              <div>{t('test:pluginTutorial.steps.step6.steps.prItems.testing')}</div>
              <div>{t('test:pluginTutorial.steps.step6.steps.prItems.breaking')}</div>
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="bg-gray-50 h-full">
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              aria-label="Go back"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <h1 className="text-3xl font-bold text-gray-900">{t('test:pluginTutorial.title')}</h1>
          </div>
          <p className="text-gray-600">
            {t('test:pluginTutorial.description')}
          </p>
        </div>

        <div className="mb-6 flex gap-2">
          <Button
            variant={activeSection === 'guide' ? 'primary' : 'secondary'}
            onClick={() => setActiveSection('guide')}
          >
            {t('test:pluginTutorial.tabs.guide')}
          </Button>
          <Button
            variant={activeSection === 'checklist' ? 'primary' : 'secondary'}
            onClick={() => setActiveSection('checklist')}
          >
            {t('test:pluginTutorial.tabs.checklist')}
          </Button>
          <Button
            variant={activeSection === 'issues' ? 'primary' : 'secondary'}
            onClick={() => setActiveSection('issues')}
          >
            {t('test:pluginTutorial.tabs.issues')}
          </Button>
          <Button
            variant={activeSection === 'import' ? 'primary' : 'secondary'}
            onClick={() => setActiveSection('import')}
          >
            {t('test:pluginTutorial.tabs.import')}
          </Button>
        </div>

        {activeSection === 'guide' && (
          <div className="space-y-4">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`bg-white rounded-lg shadow-sm border ${
                  completedSteps.includes(step.id) ? 'border-green-500' : 'border-gray-200'
                } overflow-hidden`}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Step {step.id}: {step.title}
                        </h3>
                        {completedSteps.includes(step.id) && (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                            Completed
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{step.description}</p>
                    </div>
                    <button
                      onClick={() => toggleStep(step.id)}
                      className="ml-4 p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                    >
                      {completedSteps.includes(step.id) ? (
                        <svg className="w-6 h-6 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" strokeWidth="2" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="mt-4">{step.content}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeSection === 'checklist' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('test:pluginTutorial.checklist.title')}</h2>
              <p className="text-sm text-gray-600 mb-6">
                {t('test:pluginTutorial.checklist.intro')}
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-3 text-gray-900">{t('test:pluginTutorial.checklist.structure.title')}</h3>
                  <div className="space-y-2 ml-6">
                    <ChecklistItem>{t('test:pluginTutorial.checklist.structure.item1')}</ChecklistItem>
                    <ChecklistItem>{t('test:pluginTutorial.checklist.structure.item2')}</ChecklistItem>
                    <ChecklistItem>{t('test:pluginTutorial.checklist.structure.item3')}</ChecklistItem>
                    <ChecklistItem>{t('test:pluginTutorial.checklist.structure.item4')}</ChecklistItem>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3 text-gray-900">{t('test:pluginTutorial.checklist.functionality.title')}</h3>
                  <div className="space-y-2 ml-6">
                    <ChecklistItem>{t('test:pluginTutorial.checklist.functionality.item1')}</ChecklistItem>
                    <ChecklistItem>{t('test:pluginTutorial.checklist.functionality.item2')}</ChecklistItem>
                    <ChecklistItem>{t('test:pluginTutorial.checklist.functionality.item3')}</ChecklistItem>
                    <ChecklistItem>{t('test:pluginTutorial.checklist.functionality.item4')}</ChecklistItem>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3 text-gray-900">{t('test:pluginTutorial.checklist.validation.title')}</h3>
                  <div className="space-y-2 ml-6">
                    <ChecklistItem>{t('test:pluginTutorial.checklist.validation.item1')}</ChecklistItem>
                    <ChecklistItem>{t('test:pluginTutorial.checklist.validation.item2')}</ChecklistItem>
                    <ChecklistItem>{t('test:pluginTutorial.checklist.validation.item3')}</ChecklistItem>
                    <ChecklistItem>{t('test:pluginTutorial.checklist.validation.item4')}</ChecklistItem>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3 text-gray-900">{t('test:pluginTutorial.checklist.testing.title')}</h3>
                  <div className="space-y-2 ml-6">
                    <ChecklistItem>{t('test:pluginTutorial.checklist.testing.item1')}</ChecklistItem>
                    <ChecklistItem>{t('test:pluginTutorial.checklist.testing.item2')}</ChecklistItem>
                    <ChecklistItem>{t('test:pluginTutorial.checklist.testing.item3')}</ChecklistItem>
                    <ChecklistItem>{t('test:pluginTutorial.checklist.testing.item4')}</ChecklistItem>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'issues' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">{t('test:pluginTutorial.issues.title')}</h2>

              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold text-sm mb-2 text-gray-900">{t('test:pluginTutorial.issues.pluginNotAppearing.title')}</h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>{t('test:pluginTutorial.issues.pluginNotAppearing.item1')}</div>
                    <div>{t('test:pluginTutorial.issues.pluginNotAppearing.item2')}</div>
                    <div>{t('test:pluginTutorial.issues.pluginNotAppearing.item3')}</div>
                    <div>{t('test:pluginTutorial.issues.pluginNotAppearing.item4')}</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-2 text-gray-900">{t('test:pluginTutorial.issues.templateIssues.title')}</h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>{t('test:pluginTutorial.issues.templateIssues.item1')}</div>
                    <div>{t('test:pluginTutorial.issues.templateIssues.item2')}</div>
                    <div>{t('test:pluginTutorial.issues.templateIssues.item3')}</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-2 text-gray-900">{t('test:pluginTutorial.issues.hookFailures.title')}</h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>{t('test:pluginTutorial.issues.hookFailures.item1')}</div>
                    <div>{t('test:pluginTutorial.issues.hookFailures.item2')}</div>
                    <div>{t('test:pluginTutorial.issues.hookFailures.item3')}</div>
                    <div>{t('test:pluginTutorial.issues.hookFailures.item4')}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-semibold text-blue-900 mb-3">{t('test:pluginTutorial.issues.help.title')}</h3>
              <div className="text-blue-800 text-sm">
                <p className="mb-2">{t('test:pluginTutorial.issues.help.intro')}</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>{t('test:pluginTutorial.issues.help.item1')}</li>
                  <li>{t('test:pluginTutorial.issues.help.item2')}</li>
                  <li>{t('test:pluginTutorial.issues.help.item3')}</li>
                  <li>{t('test:pluginTutorial.issues.help.item4')}</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'import' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">{t('plugins.custom.tutorial.pageTitle')}</h2>

              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="font-semibold text-blue-900 text-sm mb-2">{t('plugins.custom.tutorial.requirementsTitle')}</div>
                  <div className="text-blue-800 text-sm space-y-1">
                    <div>{t('plugins.custom.tutorial.requirement1')}</div>
                    <div>{t('plugins.custom.tutorial.requirement2')}</div>
                    <div>{t('plugins.custom.tutorial.requirement3')}</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('plugins.custom.tutorial.folderLabel')}
                    </label>
                    <div className="flex gap-3">
                      <Button
                        variant="secondary"
                        onClick={handleSelectFolder}
                      >
                        {t('plugins.custom.selectFolder')}
                      </Button>
                      {selectedFolder && (
                        <div className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded text-sm text-gray-700 overflow-x-auto">
                          {selectedFolder}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Button
                      variant="primary"
                      onClick={handleImportPlugin}
                      disabled={!selectedFolder}
                    >
                      {t('plugins.custom.addPlugin')}
                    </Button>
                  </div>

                  {importStatus.type && (
                    <div className={`p-4 rounded-lg ${
                      importStatus.type === 'success'
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-red-50 border border-red-200'
                    }`}>
                      <div className={`text-sm ${
                        importStatus.type === 'success' ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {importStatus.message}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="font-semibold text-yellow-900 text-sm mb-2">{t('plugins.custom.tutorial.notesTitle')}</div>
                  <div className="text-yellow-800 text-sm space-y-1">
                    <div>{t('plugins.custom.tutorial.note1')}</div>
                    <div>{t('plugins.custom.tutorial.note2')}</div>
                    <div>{t('plugins.custom.tutorial.note3')}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChecklistItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      <span className="text-sm text-gray-700">{children}</span>
    </div>
  );
}
