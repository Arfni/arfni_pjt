# Changelog

All notable changes to the GitHub Actions CI/CD Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-10

### Added
- Initial release of GitHub Actions CI/CD Plugin
- Spring Boot deployment support with Gradle
- Node.js deployment support
- React deployment support with static file serving
- Next.js deployment support with SSR
- Python deployment support (FastAPI, Flask, Django)
- Automatic GitHub OAuth integration via ARFNI GUI
- Automatic GitHub Secrets configuration (EC2_HOST, EC2_USER, EC2_SSH_KEY)
- Zero-downtime deployment with automatic backups
- Backup retention (keeps last 5 backups)
- Docker Compose integration for service restart
- Manual workflow trigger support
- Multi-branch deployment capability
- Comprehensive error handling and logging
- Detailed README documentation with troubleshooting guide

### Supported
- Java versions: 11, 17, 21
- Node.js versions: 16, 18, 20
- Python versions: 3.9, 3.10, 3.11, 3.12
- GitHub Actions workflow automation
- EC2 deployment via SSH
- Docker-based deployments

### Security
- Secure credential storage via GitHub Secrets
- SSH key-based authentication
- No plaintext credentials in workflow files
- Encrypted secret transmission

## [Unreleased]

### Planned Features
- Multi-environment support (staging, production)
- Automated health checks after deployment
- Slack/Discord notification integrations
- Automated rollback on failure
- Blue-green deployment support
- Canary deployment support
- Database migration hooks
- Pre-deployment and post-deployment hooks
- Custom build script support
- Maven support for Spring Boot (currently Gradle only)
- Yarn support (currently npm only)
- Poetry support for Python
- Test execution before deployment
- Code coverage reports
- Performance monitoring integration

### Future Improvements
- Workflow customization UI in ARFNI GUI
- Deployment history tracking
- Deployment analytics and metrics
- Cost estimation for deployments
- Deployment scheduling
- Automatic dependency updates
- Security scanning integration
