/**
 * 붙여넣을 텍스트를 다듬는다.
 *
 * 복사한 명령어에는 끝에 개행이 딸려오는 경우가 많다(줄 단위 선택, 웹 코드블록 등).
 * 그대로 넣으면 붙여넣는 즉시 실행된다. `rm -rf` 같은 게 섞여 있으면 사고다.
 * 그래서 **끝의 개행만** 떼어내고 프롬프트에 올려둔 채로 둔다. 실행은 사용자가 Enter로 한다.
 *
 * 중간 개행은 건드리지 않는다. 여러 줄 붙여넣기는 bracketed paste가 처리한다.
 */
export function sanitizePasteText(text: string): string {
  return text.replace(/[\r\n]+$/, '');
}

/** 중간에 개행이 남아 있으면 여러 줄 붙여넣기다 (확인 문구를 띄울지 판단용). */
export function isMultilinePaste(text: string): boolean {
  return /[\r\n]/.test(sanitizePasteText(text));
}
