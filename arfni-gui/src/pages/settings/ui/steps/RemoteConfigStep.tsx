import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, confirm } from "@tauri-apps/plugin-dialog";

type Ec2Entry = {
  host: string;
  user: string;
  pem_path: string;
};

interface RemoteConfigStepProps {
  ec2Address: string;
  setEc2Address: (value: string) => void;
  ec2Username: string;
  setEc2Username: (value: string) => void;
  pemFilePath: string;
  setPemFilePath: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function RemoteConfigStep({
  ec2Address,
  setEc2Address,
  ec2Username,
  setEc2Username,
  pemFilePath,
  setPemFilePath,
  onNext,
  onBack,
}: RemoteConfigStepProps) {
  // 저장된 서버 목록
  const [ec2List, setEc2List] = useState<Ec2Entry[]>([]);
  const [ec2Loading, setEc2Loading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // UI 상태 관리
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [originalEntry, setOriginalEntry] = useState<Ec2Entry | null>(null);

  // 선택된 서버 추적
  const [selectedServerKey, setSelectedServerKey] = useState<string | null>(null);

  // 삭제 진행 표시
  const [delBusyKey, setDelBusyKey] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  // PEM 파일 선택 다이얼로그
  const pickPemFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "PEM Files", extensions: ["pem"] }],
        title: "PEM 파일 선택",
      });
      if (selected === null) return;
      if (Array.isArray(selected)) setPemFilePath(selected[0] ?? "");
      else if (typeof selected === "string") setPemFilePath(selected);
    } catch (e) {
      console.error("PEM 파일 선택 실패:", e);
      setSaveStatus("❌ 파일 선택 실패");
    }
  }, [setPemFilePath]);

  // 폼 초기화
  const clearForm = useCallback(() => {
    setEc2Address("");
    setEc2Username("ec2-user");
    setPemFilePath("");
    setSaveStatus(null);
    setSelectedServerKey(null);
  }, [setEc2Address, setEc2Username, setPemFilePath]);

  // 저장된 EC2 목록 불러오기
  const loadEc2List = useCallback(async () => {
    setEc2Loading(true);
    try {
      const list = await invoke<Ec2Entry[]>("ec2_read_entry");
      setEc2List(list);
    } catch (err) {
      console.error("목록 불러오기 실패:", err);
    } finally {
      setEc2Loading(false);
    }
  }, []);

  // EC2 항목 저장
  const saveEc2Entry = useCallback(async () => {
    setSaveStatus(null);
    if (!ec2Address || !ec2Username || !pemFilePath) {
      setSaveStatus("⚠️ 모든 필드를 입력해주세요.");
      return;
    }
    try {
      // 편집 모드인 경우 기존 항목 삭제
      if (editMode && originalEntry) {
        await invoke("ec2_delete_entry", {
          params: { host: originalEntry.host, user: originalEntry.user },
        });
      }

      await invoke("ec2_add_entry", {
        params: { host: ec2Address, user: ec2Username, pem_path: pemFilePath },
      });
      setSaveStatus("✅ 저장 완료");
      await loadEc2List();

      // 폼 닫기
      setShowForm(false);
      setEditMode(false);
      setOriginalEntry(null);
      clearForm();
    } catch (err) {
      console.error("저장 실패:", err);
      setSaveStatus("❌ 저장 실패: " + String(err));
    }
  }, [ec2Address, ec2Username, pemFilePath, editMode, originalEntry, loadEc2List, clearForm]);

  // 저장된 서버 선택
  const selectServer = useCallback(
    (entry: Ec2Entry) => {
      const serverKey = `${entry.host}__${entry.user}`;

      // 이미 선택된 서버를 다시 클릭하면 선택 해제
      if (selectedServerKey === serverKey) {
        setSelectedServerKey(null);
        clearForm();
      } else {
        setEc2Address(entry.host);
        setEc2Username(entry.user);
        setPemFilePath(entry.pem_path);
        setSelectedServerKey(serverKey);
        setSaveStatus(null);
      }
    },
    [setEc2Address, setEc2Username, setPemFilePath, selectedServerKey, clearForm]
  );

  // 새 서버 추가 시작
  const startAddNew = useCallback(() => {
    clearForm();
    setEditMode(false);
    setOriginalEntry(null);
    setShowForm(true);
  }, [clearForm]);

  // 편집 시작
  const startEdit = useCallback(
    (entry: Ec2Entry) => {
      setEc2Address(entry.host);
      setEc2Username(entry.user);
      setPemFilePath(entry.pem_path);
      setOriginalEntry(entry);
      setEditMode(true);
      setShowForm(true);
      setSaveStatus(null);
    },
    [setEc2Address, setEc2Username, setPemFilePath]
  );

  // 삭제
  const deleteEntry = useCallback(
    async (host: string, user: string) => {
      if (delBusyKey) return;

      const ok = await confirm(`삭제하시겠습니까?\n${user}@${host}`, {
        title: "삭제 확인",
        kind: "warning",
        okLabel: "삭제",
        cancelLabel: "취소",
      });
      if (!ok) return;

      const key = `${host}__${user}`;
      setDelBusyKey(key);
      try {
        const removed = await invoke<boolean>("ec2_delete_entry", {
          params: { host, user },
        });
        if (removed) {
          setEc2List((prev) => prev.filter((e) => !(e.host === host && e.user === user)));
        } else {
          alert("삭제 대상이 없습니다.");
        }
      } catch (e) {
        console.error(e);
        alert("삭제 실패: " + String(e));
      } finally {
        setDelBusyKey(null);
      }
    },
    [delBusyKey]
  );

  // 폼 취소
  const cancelForm = useCallback(() => {
    setShowForm(false);
    setEditMode(false);
    setOriginalEntry(null);
    clearForm();
  }, [clearForm]);

  // 컴포넌트 마운트 시 목록 로드
  useEffect(() => {
    loadEc2List();
  }, [loadEc2List]);

  return (
    <>
      <h3 className="text-2xl font-bold mb-6">원격 서버 설정</h3>

      {!showForm ? (
        // 목록 보기 모드
        <>
          <p className="text-gray-600 mb-6">저장된 서버를 선택하거나 새로 추가하세요</p>

          {/* 저장된 서버 목록 */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-gray-700">저장된 서버 목록</h4>
              <button
                type="button"
                onClick={loadEc2List}
                disabled={ec2Loading}
                className="text-xs text-gray-600 hover:text-gray-900 underline"
              >
                {ec2Loading ? "로딩 중..." : "새로고침"}
              </button>
            </div>

            {ec2List.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-gray-500 mb-4">저장된 서버가 없습니다</p>
                <button
                  type="button"
                  onClick={startAddNew}
                  className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
                >
                  + 새 서버 추가
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                  {ec2List.map((entry) => {
                    const serverKey = `${entry.host}__${entry.user}`;
                    const busy = delBusyKey === serverKey;
                    const isSelected = selectedServerKey === serverKey;
                    return (
                      <div
                        key={`${entry.host}-${entry.user}`}
                        onClick={() => selectServer(entry)}
                        className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                          isSelected
                            ? "bg-blue-50 border-blue-500"
                            : "bg-white border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm font-medium text-gray-900 mb-1">
                              {entry.user}@{entry.host}
                            </div>
                            <div className="text-xs text-gray-500 truncate">{entry.pem_path}</div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEdit(entry);
                              }}
                              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                              편집
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteEntry(entry.host, entry.user);
                              }}
                              disabled={busy}
                              className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                            >
                              {busy ? "삭제 중..." : "삭제"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={startAddNew}
                  className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 text-gray-600 hover:text-gray-900"
                >
                  + 새 서버 추가
                </button>
              </>
            )}
          </div>

          {/* 하단 버튼 */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              이전
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!ec2Address || !ec2Username || !pemFilePath}
              className={`px-4 py-2 rounded-lg ${
                ec2Address && ec2Username && pemFilePath
                  ? "bg-black text-white hover:bg-gray-800"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              다음
            </button>
          </div>
        </>
      ) : (
        // 폼 보기 모드 (추가/편집)
        <>
          <p className="text-gray-600 mb-6">
            {editMode ? "서버 정보를 수정하세요" : "새 서버 정보를 입력하세요"}
          </p>

          <div className="space-y-6">
            {/* EC2 주소 */}
            <div>
              <label htmlFor="ec2Address" className="block text-sm font-medium text-gray-700 mb-2">
                EC2 주소 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="ec2Address"
                value={ec2Address}
                onChange={(e) => setEc2Address(e.target.value)}
                placeholder="예: ec2-12-34-56-78.compute.amazonaws.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
              />
            </div>

            {/* 사용자명 */}
            <div>
              <label htmlFor="ec2Username" className="block text-sm font-medium text-gray-700 mb-2">
                사용자명 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="ec2Username"
                value={ec2Username}
                onChange={(e) => setEc2Username(e.target.value)}
                placeholder="예: ec2-user, ubuntu, admin"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
              />
              <p className="mt-1 text-sm text-gray-500">
                EC2 인스턴스의 SSH 접속 사용자명 (기본값: ec2-user)
              </p>
            </div>

            {/* PEM 파일 경로 */}
            <div>
              <label htmlFor="pemFilePath" className="block text-sm font-medium text-gray-700 mb-2">
                PEM 파일 경로 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="pemFilePath"
                  value={pemFilePath}
                  onChange={(e) => setPemFilePath(e.target.value)}
                  placeholder="예: C:\Users\SSAFY\Downloads\mytest.pem"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                />
                <button
                  type="button"
                  onClick={pickPemFile}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap"
                >
                  파일 선택
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                EC2 인스턴스 접속에 필요한 PEM 키 파일의 전체 경로를 입력하세요
              </p>
            </div>

            {saveStatus && <div className="text-sm">{saveStatus}</div>}

            {/* 폼 하단 버튼 */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={cancelForm}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveEc2Entry}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
              >
                {editMode ? "저장" : "추가"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
