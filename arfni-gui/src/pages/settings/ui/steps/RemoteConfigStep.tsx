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
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <>
      <h3 className="text-2xl font-bold mb-6">원격 서버 설정</h3>
      <p className="text-gray-600 mb-6">원격 서버 접속 정보를 입력하세요</p>

      <form onSubmit={handleSubmit} className="space-y-6">
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
            required
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
            required
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
          <input
            type="text"
            id="pemFilePath"
            value={pemFilePath}
            onChange={(e) => setPemFilePath(e.target.value)}
            placeholder="예: C:\Users\SSAFY\Downloads\mytest.pem"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
            required
          />
          <p className="mt-1 text-sm text-gray-500">
            EC2 인스턴스 접속에 필요한 PEM 키 파일의 전체 경로를 입력하세요
          </p>
        </div>

        {/* 우측 하단 버튼들 */}
        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            이전
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
          >
            다음
          </button>
        </div>
      </form>
    </>
  );
}
