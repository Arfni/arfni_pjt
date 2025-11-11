import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/ui/Button/Button";

export default function PluginTestTutorial() {
  const navigate = useNavigate();
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [activeSection, setActiveSection] = useState<'guide' | 'checklist' | 'issues'>('guide');

  const toggleStep = (step: number) => {
    setCompletedSteps(prev =>
      prev.includes(step) ? prev.filter(s => s !== step) : [...prev, step]
    );
  };

  const steps = [
    {
      id: 1,
      title: "Plugin Structure Setup",
      description: "Create your plugin directory with required files",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Create a new directory under the appropriate category in the <code className="bg-gray-100 px-2 py-1 rounded font-mono text-xs">plugins/</code> folder:
          </p>
          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
            <div>plugins/</div>
            <div className="ml-4">└── [category]/</div>
            <div className="ml-8">└── [your-plugin]/</div>
            <div className="ml-12">├── plugin.yaml</div>
            <div className="ml-12">├── README.md</div>
            <div className="ml-12">├── icon.png (128x128px)</div>
            <div className="ml-12">├── templates/ (optional)</div>
            <div className="ml-12">├── hooks/ (optional)</div>
            <div className="ml-12">└── frameworks/ (optional)</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="font-semibold text-blue-900 text-sm mb-2">Valid Categories</div>
            <div className="text-blue-800 text-sm">
              framework, database, cache, message_queue, proxy, cicd, orchestration, infrastructure
            </div>
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: "Write plugin.yaml",
      description: "Define your plugin metadata and configuration",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Create your <code className="bg-gray-100 px-2 py-1 rounded font-mono text-xs">plugin.yaml</code> with required fields:
          </p>
          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
            <pre>{`apiVersion: v0.1
name: my-awesome-plugin
version: 1.0.0
category: framework
description: "Brief description of your plugin"
author:
  name: "Your Name"
  email: "your.email@example.com"

provides:
  frameworks:
    - django
    - flask
  # OR for services:
  service_kinds:
    - database
    - cache

requirements:
  os:
    - linux
    - darwin
  arch:
    - amd64
    - arm64

contributes:
  port: 8000
  environment:
    - name: APP_ENV
      default: "production"
      description: "Application environment"

documentation:
  homepage: "https://example.com"
  repository: "https://github.com/user/plugin"

tags:
  - web
  - python`}</pre>
          </div>
        </div>
      )
    },
    {
      id: 3,
      title: "Validate Plugin Locally",
      description: "Run validation script before testing in GUI",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Before testing in ARFNI GUI, validate your plugin structure:
          </p>
          <div className="space-y-3">
            <div>
              <h4 className="font-semibold text-sm mb-2">1. Install Dependencies</h4>
              <div className="bg-gray-900 text-gray-100 p-3 rounded-lg font-mono text-xs">
                cd scripts<br />
                npm install
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-2">2. Run Validation</h4>
              <div className="bg-gray-900 text-gray-100 p-3 rounded-lg font-mono text-xs">
                node generate-registry.js
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-2">3. Check Output</h4>
              <p className="text-sm text-gray-600">
                The script will validate all plugins and generate <code className="bg-gray-100 px-2 py-1 rounded font-mono text-xs">registry/index.json</code>.
                Check for validation errors specific to your plugin.
              </p>
            </div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="font-semibold text-yellow-900 text-sm mb-2">Common Validation Errors</div>
            <div className="text-yellow-800 text-sm space-y-1">
              <div>• Missing required fields (apiVersion, name, version, category)</div>
              <div>• Invalid category name</div>
              <div>• Invalid version format (must be semantic: X.Y.Z)</div>
              <div>• Missing provides.frameworks or provides.service_kinds</div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 4,
      title: "Link Plugin to ARFNI GUI",
      description: "Connect your plugin repository to local ARFNI installation",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            To test your plugin in the ARFNI GUI, you need to configure it to load from your local development directory:
          </p>
          <div className="space-y-3">
            <div>
              <h4 className="font-semibold text-sm mb-2">Option 1: Environment Variable (Recommended)</h4>
              <div className="bg-gray-900 text-gray-100 p-3 rounded-lg font-mono text-xs">
                # Set plugin directory path<br />
                export ARFNI_PLUGIN_DIR="/path/to/arfni-plugins"<br />
                <br />
                # Run ARFNI GUI<br />
                npm run tauri dev
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-2">Option 2: Symlink Method</h4>
              <div className="bg-gray-900 text-gray-100 p-3 rounded-lg font-mono text-xs">
                # Create symlink in ARFNI GUI plugins directory<br />
                ln -s /path/to/arfni-plugins/plugins ~/.arfni/plugins
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-2">Option 3: Configuration File</h4>
              <p className="text-sm text-gray-600 mb-2">
                Edit ARFNI config file at <code className="bg-gray-100 px-2 py-1 rounded font-mono text-xs">~/.arfni/config.json</code>:
              </p>
              <div className="bg-gray-900 text-gray-100 p-3 rounded-lg font-mono text-xs">
                {`{
  "pluginDirectory": "/path/to/arfni-plugins/plugins"
}`}
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 5,
      title: "Test in ARFNI GUI",
      description: "Verify your plugin loads and works correctly",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Once linked, test your plugin in the ARFNI GUI:
          </p>
          <div className="space-y-3">
            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-800 text-xs">1</span>
                Start ARFNI GUI
              </h4>
              <div className="bg-gray-900 text-gray-100 p-3 rounded-lg font-mono text-xs">
                cd arfni-gui<br />
                npm run tauri dev
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-800 text-xs">2</span>
                Create New Project
              </h4>
              <p className="text-sm text-gray-600">
                Go to Projects page and create a new project. Your plugin should appear in the available plugins list.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-800 text-xs">3</span>
                Add Plugin to Canvas
              </h4>
              <p className="text-sm text-gray-600">
                Open the canvas and drag your plugin from the sidebar. Configure it with test values.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-800 text-xs">4</span>
                Generate Files
              </h4>
              <p className="text-sm text-gray-600">
                Use the "Generate" feature to see if your plugin creates the expected template files correctly.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-800 text-xs">5</span>
                Test Hooks
              </h4>
              <p className="text-sm text-gray-600">
                If your plugin includes lifecycle hooks, deploy the project and verify hooks execute at the right time.
              </p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="font-semibold text-blue-900 text-sm mb-2">Debugging Tips</div>
            <div className="text-blue-800 text-sm space-y-1">
              <div>• Check browser console for plugin loading errors</div>
              <div>• Verify plugin appears in registry/index.json</div>
              <div>• Ensure icon.png is exactly 128x128 pixels</div>
              <div>• Test with minimal configuration first</div>
              <div>• Check Tauri backend logs for hook execution errors</div>
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
            <h1 className="text-3xl font-bold text-gray-900">Plugin Testing Tutorial</h1>
          </div>
          <p className="text-gray-600">
            Learn how to develop and test ARFNI plugins locally before submitting them to the repository.
          </p>
        </div>

        <div className="mb-6 flex gap-2">
          <Button
            variant={activeSection === 'guide' ? 'primary' : 'secondary'}
            onClick={() => setActiveSection('guide')}
          >
            Step-by-Step Guide
          </Button>
          <Button
            variant={activeSection === 'checklist' ? 'primary' : 'secondary'}
            onClick={() => setActiveSection('checklist')}
          >
            Testing Checklist
          </Button>
          <Button
            variant={activeSection === 'issues' ? 'primary' : 'secondary'}
            onClick={() => setActiveSection('issues')}
          >
            Common Issues
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
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Plugin Testing Checklist</h2>
              <p className="text-sm text-gray-600 mb-6">
                Make sure to verify all these items before submitting your plugin
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-3 text-gray-900">File Structure</h3>
                  <div className="space-y-2 ml-6">
                    <ChecklistItem>plugin.yaml exists and is valid</ChecklistItem>
                    <ChecklistItem>README.md with clear documentation</ChecklistItem>
                    <ChecklistItem>icon.png is exactly 128x128 pixels</ChecklistItem>
                    <ChecklistItem>All template files use correct Go template syntax</ChecklistItem>
                    <ChecklistItem>Hook scripts are executable (chmod +x)</ChecklistItem>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3 text-gray-900">plugin.yaml Validation</h3>
                  <div className="space-y-2 ml-6">
                    <ChecklistItem>apiVersion follows v0.1 format</ChecklistItem>
                    <ChecklistItem>Version uses semantic versioning (X.Y.Z)</ChecklistItem>
                    <ChecklistItem>Category is one of 8 valid categories</ChecklistItem>
                    <ChecklistItem>Has either frameworks or service_kinds in provides</ChecklistItem>
                    <ChecklistItem>Author information is complete</ChecklistItem>
                    <ChecklistItem>All required environment variables documented</ChecklistItem>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3 text-gray-900">Functional Testing</h3>
                  <div className="space-y-2 ml-6">
                    <ChecklistItem>Plugin loads in ARFNI GUI without errors</ChecklistItem>
                    <ChecklistItem>Plugin appears in correct category</ChecklistItem>
                    <ChecklistItem>Icon displays correctly in GUI</ChecklistItem>
                    <ChecklistItem>Configuration inputs render properly</ChecklistItem>
                    <ChecklistItem>Template files generate with correct values</ChecklistItem>
                    <ChecklistItem>Lifecycle hooks execute successfully</ChecklistItem>
                    <ChecklistItem>Works with different input combinations</ChecklistItem>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3 text-gray-900">Deployment Testing</h3>
                  <div className="space-y-2 ml-6">
                    <ChecklistItem>Generated Docker container builds successfully</ChecklistItem>
                    <ChecklistItem>Application runs without errors</ChecklistItem>
                    <ChecklistItem>Health checks pass (if implemented)</ChecklistItem>
                    <ChecklistItem>Port mappings work correctly</ChecklistItem>
                    <ChecklistItem>Environment variables are set properly</ChecklistItem>
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-6">
                  <div className="font-semibold text-green-900 text-sm mb-2">Ready to Submit?</div>
                  <div className="text-green-800 text-sm">
                    Once all checklist items are verified, you can submit your plugin via Pull Request to the arfni-plugins repository.
                    Include a detailed description of your plugin and what you tested.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'issues' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Common Issues & Solutions</h2>

              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold text-sm mb-2 text-gray-900">Plugin not appearing in GUI</h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>• Verify ARFNI_PLUGIN_DIR is set correctly</div>
                    <div>• Check that plugin passed validation (run generate-registry.js)</div>
                    <div>• Restart ARFNI GUI after adding plugin</div>
                    <div>• Check browser console for loading errors</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-2 text-gray-900">Template not generating correctly</h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>• Verify Go template syntax (use {`{{ .VariableName }}`})</div>
                    <div>• Check that variable names match contributes.environment</div>
                    <div>• Test templates with minimal values first</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-2 text-gray-900">Hook script failing</h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>• Ensure script has execute permissions (chmod +x)</div>
                    <div>• Add #!/bin/bash shebang at the top</div>
                    <div>• Test script independently before integration</div>
                    <div>• Check Tauri backend logs for detailed error messages</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-semibold text-blue-900 mb-3">Need Help?</h3>
              <div className="text-blue-800 text-sm">
                <p className="mb-2">If you encounter issues during plugin development:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Check the full documentation in README.md and README.ko.md</li>
                  <li>Review existing plugins for reference (Django, PostgreSQL, GitHub Actions)</li>
                  <li>Open an issue in the arfni-plugins repository</li>
                  <li>Join the ARFNI community discussions</li>
                </ul>
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
