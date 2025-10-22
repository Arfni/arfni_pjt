package ec2

// FileSyncer handles file transfer via SFTP

// UploadFile uploads a file to EC2
func UploadFile(localPath, remotePath string) error {
	// TODO: SFTP 파일 업로드
	return nil
}

// UploadDirectory uploads a directory to EC2
func UploadDirectory(localDir, remoteDir string) error {
	// TODO: SFTP 디렉토리 업로드
	return nil
}

// DownloadFile downloads a file from EC2
func DownloadFile(remotePath, localPath string) error {
	// TODO: SFTP 파일 다운로드
	return nil
}
