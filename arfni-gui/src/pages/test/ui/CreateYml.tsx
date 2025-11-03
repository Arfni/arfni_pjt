import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Copy } from "lucide-react";

// ✅ UI에서 조절할 최소 환경 변수만 정의
type SpringEnv = {
  JAVA_VERSION: string;
  JAVA_DIST: string;
  DEPLOY_ROOT: string;    // ex) /home/ubuntu/arfni-deploy
  DOCKER_SERVICE: string; // ex) spring
};

function buildSpringYaml(env: SpringEnv, branch: string) {
  // 내부 고정 상수 (UI에는 노출되지 않음)
  const JAR_GLOB = "build/libs/*.jar";
  const UPLOAD_DIR = "build/upload";
  const UPLOAD_NAME = "app.new.jar";
  const FINAL_NAME = "app.jar";
  const DOCKER_COMPOSE = "sudo docker compose";

  return `name: Build JAR & Deploy to EC2 (image rebuild on server)

on:
  push:
    branches: ["${branch}"]
  workflow_dispatch:
    inputs:
      branch:
        description: "${branch}"
        required: true
        default: "${branch}"

env:
  JAVA_VERSION: "${env.JAVA_VERSION}"
  JAVA_DIST: "${env.JAVA_DIST}"
  DEPLOY_ROOT: "${env.DEPLOY_ROOT}"

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - name: Checkout source (push or manual)
        uses: actions/checkout@v4
        with:
          ref: \${{ github.event_name == 'workflow_dispatch' && inputs.branch || github.ref_name }}

      - name: Set up JDK
        uses: actions/setup-java@v4
        with:
          java-version: \${{ env.JAVA_VERSION }}
          distribution: \${{ env.JAVA_DIST }}

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4

      - name: Ensure gradlew is executable
        run: chmod +x ./gradlew

      - name: Build Spring Boot JAR
        run: ./gradlew clean bootJar --no-daemon

      - name: Prepare upload artifact
        run: |
          set -euo pipefail
          JAR_PATH=$(ls -t ${JAR_GLOB} | head -n1)
          echo "[INFO] Picked jar: \${JAR_PATH}"
          mkdir -p "${UPLOAD_DIR}"
          cp -f "\${JAR_PATH}" "${UPLOAD_DIR}/${UPLOAD_NAME}"
          ls -lh "${UPLOAD_DIR}/${UPLOAD_NAME}"

      - name: Ensure target dirs exist on EC2
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: \${{ secrets.EC2_HOST }}
          username: \${{ secrets.EC2_USER }}
          key: \${{ secrets.EC2_SSH_KEY }}
          script: |
            set -euo pipefail
            mkdir -p "\${{ env.DEPLOY_ROOT }}/apps/backups"

      - name: Copy to EC2
        uses: appleboy/scp-action@v0.1.7
        with:
          host: \${{ secrets.EC2_HOST }}
          username: \${{ secrets.EC2_USER }}
          key: \${{ secrets.EC2_SSH_KEY }}
          source: ${UPLOAD_DIR}/${UPLOAD_NAME}
          target: \${{ env.DEPLOY_ROOT }}/apps
          overwrite: true
          strip_components: 2

      - name: Backup previous JAR, swap, and restart
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: \${{ secrets.EC2_HOST }}
          username: \${{ secrets.EC2_USER }}
          key: \${{ secrets.EC2_SSH_KEY }}
          script: |
            set -euo pipefail
            cd "\${{ env.DEPLOY_ROOT }}"

            APP_DIR="\${{ env.DEPLOY_ROOT }}/apps"
            BACKUP_DIR="\${{ env.DEPLOY_ROOT }}/apps/backups"

            # 새 파일 확인
            if [ ! -s "\${APP_DIR}/${UPLOAD_NAME}" ]; then
              echo "[ERROR] \${APP_DIR}/${UPLOAD_NAME} not found or empty"
              exit 1
            fi

            # 기존 JAR 백업
            if [ -f "\${APP_DIR}/${FINAL_NAME}" ]; then
              TS=$(date +%Y%m%d-%H%M%S)
              mv -f "\${APP_DIR}/${FINAL_NAME}" "\${BACKUP_DIR}/app-\${TS}.jar"
              echo "[INFO] Backed up to \${BACKUP_DIR}/app-\${TS}.jar"
            else
              echo "[INFO] No previous ${FINAL_NAME} to backup."
            fi

            # 백업 5개 유지
            ls -1t "\${BACKUP_DIR}"/app-*.jar 2>/dev/null | tail -n +6 | xargs -r rm -f

            # 새 파일로 교체
            mv -f "\${APP_DIR}/${UPLOAD_NAME}" "\${APP_DIR}/${FINAL_NAME}"
            ls -lh "\${APP_DIR}/${FINAL_NAME}"

            echo "[INFO] Docker compose rebuild..."
            ${DOCKER_COMPOSE} down
            ${DOCKER_COMPOSE} build ${env.DOCKER_SERVICE}
            echo "[INFO] Starting ${env.DOCKER_SERVICE}..."
            ${DOCKER_COMPOSE} up -d ${env.DOCKER_SERVICE}

            echo "[INFO] Running containers:"
            sudo docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

            echo "[INFO] Tail ${env.DOCKER_SERVICE} logs (last 80 lines):"
            CID=$(sudo docker ps -qf "name=${env.DOCKER_SERVICE}" | head -n1 || true)
            if [ -n "\${CID:-}" ]; then
              sudo docker logs --tail=80 "\${CID}" || true
            else
              echo "[WARN] ${env.DOCKER_SERVICE} container not found"
            fi
`;
}

export default function CreateYml() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const tmplType = (search.get("type") || "spring").toLowerCase();

  const [branch, setBranch] = useState("main");
  const [copied, setCopied] = useState(false);

  const [springEnv, setSpringEnv] = useState<SpringEnv>({
    JAVA_VERSION: "17",
    JAVA_DIST: "temurin",
    DEPLOY_ROOT: "/home/ubuntu/arfni-deploy",
    DOCKER_SERVICE: "spring",
  });

  const yamlText = useMemo(() => {
    if (tmplType === "spring") return buildSpringYaml(springEnv, branch);
    return "# FastAPI 템플릿은 추후 추가됩니다.";
  }, [tmplType, springEnv, branch]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(yamlText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = yamlText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="h-full w-full bg-gray-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded hover:bg-gray-100"
            title="뒤로"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">
            YML 생성기 {tmplType === "spring" ? "(Spring Boot)" : "(FastAPI)"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyToClipboard}
            className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {copied ? "복사됨" : "YML 복사"}
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto">
          <section className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold mb-3">설정</h2>

            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-1">템플릿</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={tmplType}
                onChange={(e) => navigate(`/yml/create?type=${e.target.value}`)}
              >
                <option value="spring">Spring Boot</option>
                <option value="fastapi">FastAPI (추가 예정)</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-1">브랜치</label>
              <div className="flex items-center gap-2">
                <input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="flex-1 border rounded px-3 py-2"
                />
                {["main", "develop"].map((b) => (
                  <button
                    key={b}
                    onClick={() => setBranch(b)}
                    className={`px-3 py-2 border rounded ${
                      branch === b ? "bg-gray-100" : "hover:bg-gray-50"
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {tmplType === "spring" && (
              <div className="space-y-3">
                {(
                  Object.keys(springEnv) as (keyof SpringEnv)[]
                ).map((key) => (
                  <div key={key}>
                    <label className="block text-sm text-gray-600 mb-1">{key}</label>
                    <input
                      value={springEnv[key]}
                      onChange={(e) =>
                        setSpringEnv((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border rounded-lg p-4 flex flex-col">
            <h2 className="font-semibold mb-3">미리보기</h2>
            <textarea
              readOnly
              value={yamlText}
              className="flex-1 font-mono text-sm border rounded p-3 whitespace-pre overflow-auto"
              spellCheck={false}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
