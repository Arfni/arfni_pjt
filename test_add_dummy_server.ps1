# 더미 EC2 서버 추가 스크립트
# Tauri 앱을 실행한 후 개발자 콘솔에서 실행하세요

# 콘솔에서 복사해서 실행:
<#
await window.__TAURI__.core.invoke('create_ec2_server', {
  name: 'Test Server',
  host: '43.200.123.45',
  user: 'ubuntu',
  pemPath: 'C:\\Users\\SSAFY\\.ssh\\test-key.pem',
  workdir: '/home/ubuntu/projects',
  mode: null
});
#>
