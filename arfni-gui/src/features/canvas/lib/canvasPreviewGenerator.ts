import * as htmlToImage from 'html-to-image';
import { projectCommands } from '@shared/api/tauri/commands';

/**
 * 캔버스를 PNG로 변환하여 프로젝트 미리보기로 저장합니다.
 * @param projectPath 프로젝트 경로
 * @returns 생성된 PNG의 data URL
 */
export async function generateAndSaveCanvasPreview(projectPath: string): Promise<string | null> {
  try {
    // React Flow 캔버스 엘리먼트 찾기
    const reactFlowElement = document.querySelector('.react-flow') as HTMLElement;
    if (!reactFlowElement) {
      console.error('[Preview] 캔버스 엘리먼트를 찾을 수 없습니다.');
      return null;
    }

    // 미니맵, 컨트롤, attribution 숨기기
    const minimap = document.querySelector('.react-flow__minimap') as HTMLElement;
    const controls = document.querySelector('.react-flow__controls') as HTMLElement;
    const attribution = document.querySelector('.react-flow__attribution') as HTMLElement;

    const elementsToHide = [minimap, controls, attribution].filter(el => el !== null);
    const originalDisplays = elementsToHide.map(el => el.style.display);
    elementsToHide.forEach(el => el.style.display = 'none');

    // PNG 생성 (export와 동일한 설정)
    const pngDataUrl = await htmlToImage.toPng(reactFlowElement, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      cacheBust: true,
    });

    // 숨긴 엘리먼트 복원
    elementsToHide.forEach((el, index) => {
      el.style.display = originalDisplays[index];
    });

    // Tauri 명령으로 PNG 저장
    await projectCommands.saveProjectPreview(projectPath, pngDataUrl);

    console.log('[Preview] 캔버스 미리보기가 저장되었습니다:', projectPath);
    return pngDataUrl;
  } catch (error) {
    console.error('[Preview] 캔버스 미리보기 생성 실패:', error);
    return null;
  }
}
