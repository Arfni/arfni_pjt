import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { selectNodes, selectEdges, selectIsDirty, setDirty } from '../model/canvasSlice';
import { selectCurrentProject } from '@features/project';
import { stackYamlGenerator, stackToYamlString } from '../lib/stackYamlGenerator';
import { projectCommands, CanvasNode } from '@shared/api/tauri/commands';

export function useAutoSave(debounceMs: number = 2000) {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector(selectNodes);
  const edges = useAppSelector(selectEdges);
  const isDirty = useAppSelector(selectIsDirty);
  const currentProject = useAppSelector(selectCurrentProject);

  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 저장 후 인디케이터 숨기기 (별도 useEffect)
  useEffect(() => {
    if (!lastSaved) return;

    console.log('🕒 Setting hide timer for 3 seconds');
    const hideTimer = setTimeout(() => {
      console.log('⏰ Hiding save indicator now');
      setLastSaved(null);
    }, 3000);

    return () => {
      clearTimeout(hideTimer);
    };
  }, [lastSaved]);

  useEffect(() => {
    // 프로젝트 없거나 변경사항 없으면 스킵
    if (!currentProject || !isDirty) {
      return;
    }

    // 이전 타이머 취소
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce: 2초 후 저장
    timeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      setSaveError(null);

      try {
        // 1. YAML 생성
        const stackYaml = stackYamlGenerator(nodes, edges, {
          projectName: currentProject.name,
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

        // 3. Rust 호출하여 파일 저장
        await projectCommands.saveStackYaml(
          currentProject.path,
          yamlContent,
          canvasData
        );

        // 4. 성공 처리
        dispatch(setDirty(false));
        setLastSaved(new Date());
        console.log('✅ Auto-saved at', new Date().toLocaleTimeString());
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
  }, [nodes, edges, isDirty, currentProject, dispatch, debounceMs]);

  return {
    isSaving,
    lastSaved,
    saveError,
  };
}
