import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { ProjectInfoStep } from './steps/ProjectInfoStep';
import { DeployEnvironmentStep } from './steps/DeployEnvironmentStep';
import { RemoteConfigStep } from './steps/RemoteConfigStep';
import { ValidationStep } from './steps/ValidationStep';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewProjectModal({ isOpen, onClose }: NewProjectModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'info' | 'location' | 'remote' | 'docker-validation' | 'ec2-validation'>('info');
  const [projectName, setProjectName] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [deployEnvironment, setDeployEnvironment] = useState<'local' | 'remote' | null>(null);
  const [ec2Address, setEc2Address] = useState('');
  const [ec2Username, setEc2Username] = useState('ec2-user');
  const [pemFilePath, setPemFilePath] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationSuccess, setValidationSuccess] = useState(false);
  const [validationFailed, setValidationFailed] = useState(false);
  const [validationError, setValidationError] = useState('');

  if (!isOpen) return null;

  const handleReset = () => {
    setStep('info');
    setProjectName('');
    setWorkingDirectory('');
    setDeployEnvironment(null);
    setEc2Address('');
    setEc2Username('ec2-user');
    setPemFilePath('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleLocalStart = () => {
    setDeployEnvironment('local');
  };

  const handleRemoteStart = () => {
    setDeployEnvironment('remote');
  };

  const handleNextFromLocation = () => {
    if (deployEnvironment === 'remote') {
      setStep('remote');
    } else if (deployEnvironment === 'local') {
      setStep('docker-validation');
      simulateDockerValidation();
    }
  };

  const simulateDockerValidation = async () => {
    setIsValidating(true);
    setValidationSuccess(false);
    setValidationFailed(false);
    setValidationError('');

    try {
      // 1. Docker 설치 확인
      const dockerInstalled = await invoke<boolean>('check_docker');
      if (!dockerInstalled) {
        setIsValidating(false);
        setValidationFailed(true);
        setValidationError('Docker가 설치되어 있지 않습니다. Docker Desktop을 설치해주세요.');
        return;
      }

      // 2. Docker 실행 확인
      try {
        await invoke<boolean>('check_docker_running');
      } catch (error) {
        setIsValidating(false);
        setValidationFailed(true);
        setValidationError(String(error));
        return;
      }

      // 3. Docker Compose 확인 (선택적)
      const composeAvailable = await invoke<boolean>('check_docker_compose');
      if (!composeAvailable) {
        console.warn('Docker Compose를 사용할 수 없습니다. 일부 기능이 제한될 수 있습니다.');
      }

      // 모든 검증 성공
      setIsValidating(false);
      setValidationSuccess(true);
    } catch (error) {
      setIsValidating(false);
      setValidationFailed(true);
      setValidationError(`Docker 검증 실패: ${error}`);
      console.error('Docker validation failed:', error);
    }
  };

  const simulateEC2Validation = async () => {
    setIsValidating(true);
    setValidationSuccess(false);
    setValidationFailed(false);
    setValidationError('');

    try {
      // SSH 연결 검증: 사용자가 입력한 username 사용
      await invoke<string>("ssh_exec_system", {
        params: {
          host: ec2Address,
          user: ec2Username,
          pem_path: pemFilePath,
          cmd: "echo 'Connection successful'",
        },
      });

      // 성공
      setIsValidating(false);
      setValidationSuccess(true);
      setValidationFailed(false);
    } catch (error) {
      // 실패
      setIsValidating(false);
      setValidationSuccess(false);
      setValidationFailed(true);
      setValidationError(String(error));
      console.error('EC2 connection failed:', error);
    }
  };

  const handleStartProject = () => {
    console.log('프로젝트 시작');
    console.log('프로젝트 이름:', projectName);
    console.log('작업 디렉토리:', workingDirectory);
    console.log('배포 환경:', deployEnvironment);
    if (deployEnvironment === 'remote') {
      console.log('EC2 주소:', ec2Address);
      console.log('사용자명:', ec2Username);
      console.log('PEM 파일 경로:', pemFilePath);
    }
    handleClose();
    navigate('/projects');
  };

  const handleRemoteFormSubmit = () => {
    setStep('ec2-validation');
    simulateEC2Validation();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4">
        {step === 'info' ? (
          <ProjectInfoStep
            projectName={projectName}
            setProjectName={setProjectName}
            workingDirectory={workingDirectory}
            setWorkingDirectory={setWorkingDirectory}
            onNext={() => setStep('location')}
            onClose={handleClose}
          />
        ) : step === 'location' ? (
          <DeployEnvironmentStep
            deployEnvironment={deployEnvironment}
            onSelectLocal={handleLocalStart}
            onSelectRemote={handleRemoteStart}
            onNext={handleNextFromLocation}
            onBack={() => setStep('info')}
          />
        ) : step === 'remote' ? (
          <RemoteConfigStep
            ec2Address={ec2Address}
            setEc2Address={setEc2Address}
            ec2Username={ec2Username}
            setEc2Username={setEc2Username}
            pemFilePath={pemFilePath}
            setPemFilePath={setPemFilePath}
            onNext={handleRemoteFormSubmit}
            onBack={() => setStep('location')}
          />
        ) : step === 'docker-validation' ? (
          <ValidationStep
            validationType="docker"
            isValidating={isValidating}
            validationSuccess={validationSuccess}
            validationFailed={validationFailed}
            validationError={validationError}
            onStartProject={handleStartProject}
            onBack={() => setStep('location')}
            onClose={handleClose}
          />
        ) : step === 'ec2-validation' ? (
          <ValidationStep
            validationType="ec2"
            isValidating={isValidating}
            validationSuccess={validationSuccess}
            validationFailed={validationFailed}
            validationError={validationError}
            ec2Address={ec2Address}
            onStartProject={handleStartProject}
            onBack={() => setStep('remote')}
            onClose={handleClose}
          />
        ) : null}
      </div>
    </div>
  );
}
