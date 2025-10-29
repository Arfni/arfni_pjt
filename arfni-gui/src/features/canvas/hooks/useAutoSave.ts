import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { selectNodes, selectEdges, selectIsDirty, setDirty } from '../model/canvasSlice';
import { selectCurrentProject, selectProjectLoading } from '@features/project';
import { stackYamlGenerator, stackToYamlString } from '../lib/stackYamlGenerator';
import { projectCommands, CanvasNode, ec2ServerCommands } from '@shared/api/tauri/commands';

export function useAutoSave(debounceMs: number = 2000) {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector(selectNodes);
  const edges = useAppSelector(selectEdges);
  const isDirty = useAppSelector(selectIsDirty);
  const currentProject = useAppSelector(selectCurrentProject);
  const isProjectLoading = useAppSelector(selectProjectLoading);

  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const projectPathRef = useRef<string | null>(null);

  // 저장 후 인디케이터 숨기기 (별도 useEffect)
  useEffect(() => {
    if (!lastSaved) return;

    const hideTimer = setTimeout(() => {
      setLastSaved(null);
    }, 3000);

    return () => {
      clearTimeout(hideTimer);
    };
  }, [lastSaved]);

  // 프로젝트 변경 감지: 타이머 즉시 취소
  useEffect(() => {
    if (currentProject?.path !== projectPathRef.current) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      projectPathRef.current = currentProject?.path || null;
    }
  }, [currentProject?.path]);

  useEffect(() => {
    // 프로젝트 로딩 중이면 스킵
    if (isProjectLoading) {
      return;
    }

    // 프로젝트 없거나 변경사항 없으면 스킵
    if (!currentProject || !isDirty) {
      return;
    }

    // EC2 프로젝트인데 ec2_server_id가 없으면 아직 초기화 안 된 것이므로 스킵
    if (currentProject.environment === 'ec2' && !currentProject.ec2_server_id) {
      return;
    }

    // 이전 타이머 취소
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // 타이머 시작 시점의 프로젝트 경로와 환경 캡처
    const projectPathAtStart = currentProject.path;
    const environmentAtStart = currentProject.environment;

    // Debounce: 2초 후 저장
    timeoutRef.current = setTimeout(async () => {
      // 저장 시점에 프로젝트가 바뀌었는지 확인
      if (projectPathRef.current !== projectPathAtStart) {
        console.warn('⚠️ Project changed during auto-save, aborting save to', projectPathAtStart);
        return;
      }

      setIsSaving(true);
      setSaveError(null);

      try {
        // 1. EC2 프로젝트일 경우 서버 정보 가져오기
        let ec2Server = null;
        if (currentProject.environment === 'ec2' && currentProject.ec2_server_id) {
          try {
            ec2Server = await ec2ServerCommands.getServerById(currentProject.ec2_server_id);
          } catch (err) {
            console.error('EC2 서버 정보 로드 실패:', err);
          }
        }

        // 2. YAML 생성
        const stackYaml = stackYamlGenerator(nodes, edges, {
          projectName: currentProject.name,
          environment: currentProject.environment,
          ec2Server: ec2Server || undefined,
          secrets: [],
          outputs: {},
        });
        const yamlContent = stackToYamlString(stackYaml);

        // 2. Canvas 데이터 변환
        const canvasNodes: CanvasNode[] = nodes.map(node => ({
          id: node.id,
          node_type: node.type,
          data: node.data,
          position: node.position,
        }));

        const canvasData = {
          nodes: canvasNodes,
          edges: edges.map(edge => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
          })),
          project_name: currentProject.name,
          secrets: [],
        };

        // 3. Rust 호출하여 파일 저장 (최종 검증)
        if (projectPathRef.current !== projectPathAtStart) {
          console.warn('⚠️ Project changed right before save, aborting');
          return;
        }

        await projectCommands.saveStackYaml(
          projectPathAtStart,
          yamlContent,
          canvasData
        );

        // 4. 성공 처리
        dispatch(setDirty(false));
        setLastSaved(new Date());
      } catch (error) {
        console.error('❌ Auto-save failed:', error);
        setSaveError(error instanceof Error ? error.message : 'Unknown error');
      } finally {
        setIsSaving(false);
      }
    }, debounceMs);

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [nodes, edges, isDirty, currentProject, dispatch, debounceMs, isProjectLoading]);

  return {
    isSaving,
    lastSaved,
    saveError,
  };
}
