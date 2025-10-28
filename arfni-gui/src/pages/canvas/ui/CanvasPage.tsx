import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CanvasEditor } from '@widgets/canvas-editor';
import { LogViewer } from '@widgets/log-viewer';
import { Toolbar } from '@widgets/toolbar';
import { NodePalette } from '@widgets/node-palette';
import { YamlEditor } from '@widgets/yaml-editor';
import { PropertyPanel } from '@widgets/property-panel';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { openProject, selectCurrentProject, selectProjectLoading } from '@features/project';
import { Project } from '@shared/api/tauri/commands';

export function CanvasPage() {
  const location = useLocation();
  const dispatch = useAppDispatch();
  const currentProject = useAppSelector(selectCurrentProject);
  const isLoading = useAppSelector(selectProjectLoading);

  // ProjectsPage에서 전달받은 프로젝트 정보
  const passedProject = location.state?.project as Project | undefined;

  useEffect(() => {
    // 전달받은 프로젝트가 있고, 현재 프로젝트와 다른 경우 로드
    if (passedProject && passedProject.path !== currentProject?.path) {
      console.log('프로젝트 로드:', passedProject.name, passedProject.path);
      dispatch(openProject(passedProject.path));
    }
  }, [passedProject, currentProject, dispatch]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">프로젝트를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <Toolbar />
      <div className="flex-1 flex overflow-hidden">
        {/* 왼쪽: 노드 팔레트 */}
        <NodePalette />

        {/* 중앙: Canvas */}
        <div className="flex-1" style={{ pointerEvents: 'auto' }}>
          <CanvasEditor />
        </div>

        {/* 오른쪽: Property Panel + YAML 미리보기 + 로그 */}
        <div className="w-96 border-l border-gray-200 flex flex-col overflow-hidden">
          {/* 상단: Property Panel - 속성 입력 */}
          <div className="flex-1 border-b border-gray-200 overflow-auto">
            <PropertyPanel />
          </div>

          {/* 중단: YAML 미리보기 - 읽기 전용 */}
          <div className="h-64 border-b border-gray-200 overflow-hidden">
            <YamlEditor />
          </div>

          {/* 하단: 로그 뷰어 */}
          <div className="h-48 overflow-hidden">
            <LogViewer />
          </div>
        </div>
      </div>
    </div>
  );
}