package ec2

import (
	"fmt"
	"io"
	"net"
	"sync"

	"golang.org/x/crypto/ssh"
)

// TunnelManager SSH 터널을 관리하는 구조체
type TunnelManager struct {
	sshClient  *ssh.Client
	listener   net.Listener
	localPort  int
	remotePort int
	host       string
	running    bool
	mu         sync.Mutex
	stopChan   chan struct{}
}

// TunnelConfig 터널 설정
type TunnelConfig struct {
	Host       string // EC2 호스트 주소
	User       string // SSH 사용자명
	KeyPath    string // SSH 키 파일 경로
	LocalPort  int    // 로컬 포트
	RemotePort int    // 원격 포트 (Node Exporter)
}

// NewTunnelManager 새로운 TunnelManager 생성
func NewTunnelManager(config TunnelConfig) (*TunnelManager, error) {
	// SSH 클라이언트 생성
	sshClient, err := createSSHClientFromKeyPath(config.Host, config.User, config.KeyPath)
	if err != nil {
		return nil, fmt.Errorf("SSH 연결 실패: %w", err)
	}

	return &TunnelManager{
		sshClient:  sshClient,
		localPort:  config.LocalPort,
		remotePort: config.RemotePort,
		host:       config.Host,
		running:    false,
		stopChan:   make(chan struct{}),
	}, nil
}

// Start 터널 시작 (블로킹)
func (tm *TunnelManager) Start() error {
	tm.mu.Lock()
	if tm.running {
		tm.mu.Unlock()
		return fmt.Errorf("터널이 이미 실행 중입니다")
	}
	tm.running = true
	tm.mu.Unlock()

	// 로컬 리스너 생성
	localAddr := fmt.Sprintf("127.0.0.1:%d", tm.localPort)
	listener, err := net.Listen("tcp", localAddr)
	if err != nil {
		tm.running = false
		return fmt.Errorf("로컬 리스너 생성 실패: %w", err)
	}
	tm.listener = listener

	fmt.Printf("✅ SSH 터널 시작: localhost:%d -> %s:%d\n",
		tm.localPort, tm.host, tm.remotePort)
	fmt.Println("📡 Node Exporter 메트릭을 Prometheus에서 수집할 수 있습니다")
	fmt.Println("⏹️  Ctrl+C로 종료")

	// 터널 유지 (무한 루프)
	for {
		select {
		case <-tm.stopChan:
			fmt.Println("\n🛑 터널 종료 중...")
			return nil
		default:
			// 연결 대기 (타임아웃 설정)
			conn, err := listener.Accept()
			if err != nil {
				select {
				case <-tm.stopChan:
					return nil
				default:
					fmt.Printf("⚠️  연결 수락 실패: %v\n", err)
					continue
				}
			}

			// 각 연결을 고루틴으로 처리
			go tm.handleConnection(conn)
		}
	}
}

// handleConnection 개별 연결 처리
func (tm *TunnelManager) handleConnection(localConn net.Conn) {
	defer localConn.Close()

	// 원격 연결 생성
	remoteAddr := fmt.Sprintf("127.0.0.1:%d", tm.remotePort)
	remoteConn, err := tm.sshClient.Dial("tcp", remoteAddr)
	if err != nil {
		fmt.Printf("❌ 원격 연결 실패: %v\n", err)
		return
	}
	defer remoteConn.Close()

	// 양방향 복사
	done := make(chan struct{}, 2)

	// local -> remote
	go func() {
		io.Copy(remoteConn, localConn)
		done <- struct{}{}
	}()

	// remote -> local
	go func() {
		io.Copy(localConn, remoteConn)
		done <- struct{}{}
	}()

	// 둘 중 하나가 끝나면 종료
	<-done
}

// Stop 터널 종료
func (tm *TunnelManager) Stop() error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if !tm.running {
		return fmt.Errorf("터널이 실행 중이 아닙니다")
	}

	close(tm.stopChan)

	if tm.listener != nil {
		tm.listener.Close()
	}

	if tm.sshClient != nil {
		tm.sshClient.Close()
	}

	tm.running = false
	fmt.Println("✅ 터널 종료 완료")

	return nil
}

// IsRunning 터널 실행 상태 확인
func (tm *TunnelManager) IsRunning() bool {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	return tm.running
}

// GetStatus 터널 상태 정보 반환
func (tm *TunnelManager) GetStatus() string {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if tm.running {
		return fmt.Sprintf("✅ Active: localhost:%d -> %s:%d",
			tm.localPort, tm.host, tm.remotePort)
	}
	return "❌ Not running"
}
