import { useState } from 'react';
import { FolderOpen, CheckCircle, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewProjectModal({ isOpen, onClose }: NewProjectModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'info' | 'location' | 'remote' | 'docker-validation' | 'ec2-validation'>('info');
  const [projectName, setProjectName] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [locationType, setLocationType] = useState<'local' | 'remote' | null>(null);
  const [ec2Address, setEc2Address] = useState('');
  const [pemFile, setPemFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationSuccess, setValidationSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // 다음 단계로 이동
    setStep('location');
  };

  const handleReset = () => {
    setStep('info');
    setProjectName('');
    setWorkingDirectory('');
    setLocationType(null);
    setEc2Address('');
    setPemFile(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleLocalStart = () => {
    setLocationType('local');
  };

  const handleRemoteStart = () => {
    setLocationType('remote');
  };

  const handleNextFromLocation = () => {
    if (locationType === 'remote') {
      setStep('remote');
    } else if (locationType === 'local') {
      setStep('docker-validation');
      simulateDockerValidation();
    }
  };

  const handleRemoteFormSubmit = () => {
    setStep('ec2-validation');
    simulateEC2Validation();
  };

  const simulateDockerValidation = () => {
    setIsValidating(true);
    setValidationSuccess(false);

    // 2초 후 성공
    setTimeout(() => {
      setIsValidating(false);
      setValidationSuccess(true);
    }, 2000);
  };

  const simulateEC2Validation = () => {
    setIsValidating(true);
    setValidationSuccess(false);

    // 2초 후 성공
    setTimeout(() => {
      setIsValidating(false);
      setValidationSuccess(true);
    }, 2000);
  };

  const handleStartProject = () => {
    console.log('프로젝트 시작');
    console.log('프로젝트 이름:', projectName);
    console.log('작업 디렉토리:', workingDirectory);
    console.log('위치:', locationType);
    if (locationType === 'remote') {
      console.log('EC2 주소:', ec2Address);
      console.log('PEM 파일:', pemFile?.name);
    }
    handleClose();
    navigate('/logs');
  };

  const handleBrowseDirectory = () => {
    // TODO: 디렉토리 선택 다이얼로그 (Tauri API 사용)
    console.log('디렉토리 선택');
  };

  const handlePemFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPemFile(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4">
        {step === 'info' ? (
          <>
            <h3 className="text-2xl font-bold mb-6">새 프로젝트 생성</h3>
            <p className="text-gray-600 mb-6">프로젝트 기본 정보</p>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 프로젝트 이름 */}
              <div>
                <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 mb-2">
                  프로젝트 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="예: my-infra-project"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                  required
                />
              </div>

              {/* 작업 디렉토리 경로 */}
              <div>
                <label htmlFor="workingDirectory" className="block text-sm font-medium text-gray-700 mb-2">
                  작업 디렉토리 경로 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="workingDirectory"
                    value={workingDirectory}
                    onChange={(e) => setWorkingDirectory(e.target.value)}
                    placeholder="예: C:\Projects\my-project"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleBrowseDirectory}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <FolderOpen className="w-4 h-4" />
                    찾아보기
                  </button>
                </div>
              </div>

              {/* 버튼 */}
              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={handleClose}
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
        ) : step === 'location' ? (
          <>
            <h3 className="text-2xl font-bold mb-6">프로젝트 시작 위치 선택</h3>
            {/* 중앙 버튼들 */}
            <div className="flex justify-center gap-6 mb-16">
              <button
                onClick={handleLocalStart}
                className={`flex flex-col items-center justify-center w-48 h-48 bg-white border-2 rounded-lg transition-all ${
                  locationType === 'local'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-300 hover:border-black hover:bg-gray-50'
                }`}
              >
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">로컬에서 시작</h4>
                <p className="text-sm text-gray-600 text-center px-4">
                  로컬 환경에서<br />프로젝트 시작
                </p>
              </button>

              <button
                onClick={handleRemoteStart}
                className={`flex flex-col items-center justify-center w-48 h-48 bg-white border-2 rounded-lg transition-all ${
                  locationType === 'remote'
                    ? 'border-green-600 bg-green-50'
                    : 'border-gray-300 hover:border-black hover:bg-gray-50'
                }`}
              >
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">원격에서 시작</h4>
                <p className="text-sm text-gray-600 text-center px-4">
                  원격 서버에서<br />프로젝트 시작
                </p>
              </button>
            </div>

            {/* 우측 하단 버튼들 */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStep('info')}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                이전
              </button>
              <button
                onClick={handleNextFromLocation}
                disabled={!locationType}
                className={`px-4 py-2 rounded-lg ${
                  locationType
                    ? 'bg-black text-white hover:bg-gray-800'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                다음
              </button>
            </div>
          </>
        ) : step === 'remote' ? (
          <>
            <h3 className="text-2xl font-bold mb-6">원격 서버 설정</h3>
            <p className="text-gray-600 mb-6">원격 서버 접속 정보를 입력하세요</p>

            <form onSubmit={(e) => { e.preventDefault(); handleRemoteFormSubmit(); }} className="space-y-6">
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

              {/* PEM 파일 업로드 */}
              <div>
                <label htmlFor="pemFile" className="block text-sm font-medium text-gray-700 mb-2">
                  PEM 파일 업로드 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="file"
                      id="pemFile"
                      accept=".pem"
                      onChange={handlePemFileChange}
                      className="hidden"
                      required
                    />
                    <label
                      htmlFor="pemFile"
                      className="flex items-center justify-between w-full px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50"
                    >
                      <span className={pemFile ? 'text-gray-900' : 'text-gray-500'}>
                        {pemFile ? pemFile.name : 'PEM 파일을 선택하세요'}
                      </span>
                      <FolderOpen className="w-4 h-4 text-gray-500" />
                    </label>
                  </div>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  EC2 인스턴스 접속에 필요한 PEM 키 파일을 업로드하세요
                </p>
              </div>

              {/* 우측 하단 버튼들 */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setStep('location')}
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
        ) : step === 'docker-validation' ? (
          <>
            <h3 className="text-2xl font-bold mb-6">Docker 연결 검증</h3>

            <div className="py-12">
              {isValidating ? (
                <div className="flex flex-col items-center justify-center">
                  <Loader className="w-16 h-16 text-blue-600 animate-spin mb-4" />
                  <p className="text-lg text-gray-700 mb-2">Docker 연결을 확인하는 중...</p>
                  <p className="text-sm text-gray-500">잠시만 기다려주세요</p>
                </div>
              ) : validationSuccess ? (
                <div className="flex flex-col items-center justify-center">
                  <CheckCircle className="w-16 h-16 text-green-600 mb-4" />
                  <p className="text-lg font-semibold text-gray-900 mb-2">연결 성공!</p>
                  <p className="text-sm text-gray-600">Docker가 정상적으로 연결되었습니다</p>
                </div>
              ) : null}
            </div>

            {validationSuccess && (
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setStep('location')}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  이전
                </button>
                <button
                  onClick={handleStartProject}
                  className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
                >
                  시작하기
                </button>
              </div>
            )}
          </>
        ) : step === 'ec2-validation' ? (
          <>
            <h3 className="text-2xl font-bold mb-6">EC2 연결 검증</h3>

            <div className="py-12">
              {isValidating ? (
                <div className="flex flex-col items-center justify-center">
                  <Loader className="w-16 h-16 text-green-600 animate-spin mb-4" />
                  <p className="text-lg text-gray-700 mb-2">EC2 서버에 연결하는 중...</p>
                  <p className="text-sm text-gray-500">잠시만 기다려주세요</p>
                </div>
              ) : validationSuccess ? (
                <div className="flex flex-col items-center justify-center">
                  <CheckCircle className="w-16 h-16 text-green-600 mb-4" />
                  <p className="text-lg font-semibold text-gray-900 mb-2">연결 성공!</p>
                  <p className="text-sm text-gray-600 mb-1">EC2 서버가 정상적으로 연결되었습니다</p>
                  <p className="text-xs text-gray-500">{ec2Address}</p>
                </div>
              ) : null}
            </div>

            {validationSuccess && (
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setStep('remote')}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  이전
                </button>
                <button
                  onClick={handleStartProject}
                  className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
                >
                  시작하기
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
