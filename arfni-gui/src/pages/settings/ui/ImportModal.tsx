interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportModal({ isOpen, onClose }: ImportModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4">
        <h3 className="text-2xl font-bold mb-6">stack.yaml 불러오기</h3>
        <p className="text-gray-600 mb-6">파일 업로드 기능이 여기에 들어갑니다</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
          <button className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800">
            불러오기
          </button>
        </div>
      </div>
    </div>
  );
}
