import { useAppDispatch } from "@app/hooks";
import { updateNode } from "../model/canvasSlice";
import { CustomNode, ServiceNodeData, DatabaseNodeData } from "../model/types";
import { getServiceConfig } from "../config/serviceConfigs";
import {
  FormField,
  Input,
  Select,
  Checkbox,
  KeyValueEditor,
} from "../../../shared/ui/form";
import { TargetPropertyForm } from "./TargetPropertyForm";
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

interface DynamicPropertyFormProps {
  node: CustomNode;
}

export function DynamicPropertyForm({ node }: DynamicPropertyFormProps) {
  const dispatch = useAppDispatch();
  const [openSections, setOpenSections] = useState({
    basic: true,
    auth: true,
    build: true,
    health: true,
    storage: true,
    resources: true,
    env: false,
  });

  // Target 노드인 경우 TargetPropertyForm 사용
  if (node.type === "target") {
    return <TargetPropertyForm node={node} />;
  }

  const data = node.data as ServiceNodeData | DatabaseNodeData;

  // 서비스 타입 결정
  const serviceType =
    node.type === "database"
      ? (data as DatabaseNodeData).type
      : (data as ServiceNodeData).serviceType || "custom";

  console.log("DynamicPropertyForm - node:", node);
  console.log("DynamicPropertyForm - serviceType:", serviceType);
  console.log("DynamicPropertyForm - data:", data);

  const config = getServiceConfig(serviceType);

  if (!config) {
    return (
      <div style={{ padding: "1rem" }}>
        <p>Unknown service type: {serviceType}</p>
        <p>Please select a valid service type.</p>
      </div>
    );
  }

  // 노드 데이터 업데이트 헬퍼
  const updateField = (field: string, value: any) => {
    dispatch(
      updateNode({
        id: node.id,
        data: {
          ...data,
          [field]: value,
        },
      })
    );
  };

  const updateEnv = (envKey: string, envValue: string) => {
    const currentEnv = data.env || {};
    dispatch(
      updateNode({
        id: node.id,
        data: {
          ...data,
          env: {
            ...currentEnv,
            [envKey]: envValue,
          },
        },
      })
    );
  };

  const updateAllEnv = (newEnv: Record<string, string>) => {
    dispatch(
      updateNode({
        id: node.id,
        data: {
          ...data,
          env: newEnv,
        },
      })
    );
  };

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleApplyChanges = () => {
    // Apply changes logic here
    console.log("Applying changes:", data);
    alert("Changes applied successfully!");
  };

  const handleBrowseDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Volume Directory",
      });

      if (selected) {
        const currentMount =
          data.volumes?.[0]?.mount || config.defaultVolumes?.[0]?.mount || "";
        updateField("volumes", [{ host: selected, mount: currentMount }]);
      }
    } catch (error) {
      console.error("Failed to open directory dialog:", error);
    }
  };

  // Collapsible Section Component
  const CollapsibleSection = ({
    title,
    isOpen,
    onToggle,
    children,
    icon,
  }: {
    title: string;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    icon?: React.ReactNode;
  }) => (
    <div style={{ marginBottom: "0.75rem" }}>
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.625rem 0",
          cursor: "pointer",
          fontSize: "0.9375rem",
          fontWeight: 600,
          color: "#374151",
          userSelect: "none",
        }}
      >
        <span
          style={{
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        >
          ▶
        </span>
        {icon}
        {title}
      </div>
      {isOpen && (
        <div style={{ paddingLeft: "1.5rem", paddingTop: "0.5rem" }}>
          {children}
        </div>
      )}
    </div>
  );

  const isDatabase = node.type === "database";

  return (
    <div
      className="dynamic-property-form"
      style={{
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ paddingRight: "0.5rem" }}>
        {/* Basic Information */}
        <CollapsibleSection
          title="Basic Information"
          isOpen={openSections.basic}
          onToggle={() => toggleSection("basic")}
        >
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <FormField label="Service Name">
              <Input
                value={data.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="my-service"
              />
            </FormField>

            {/* Database version */}
            {config.supportsVersion && (
              <FormField label="Version">
                {config.versionOptions ? (
                  <Select
                    value={
                      (data as DatabaseNodeData).version ||
                      config.defaultVersion ||
                      ""
                    }
                    onChange={(e) => updateField("version", e.target.value)}
                    options={config.versionOptions.map((v) => ({
                      label: v,
                      value: v,
                    }))}
                  />
                ) : (
                  <Input
                    value={
                      (data as DatabaseNodeData).version ||
                      config.defaultVersion ||
                      ""
                    }
                    onChange={(e) => updateField("version", e.target.value)}
                    placeholder={config.defaultVersion}
                  />
                )}
              </FormField>
            )}

            {/* Runtime service version from additionalFields */}
            {!isDatabase && config.additionalFields && (() => {
              const versionField = config.additionalFields.find(
                (field) => field.key === "pythonVersion" || field.key === "javaVersion" || field.key === "nodeVersion"
              );

              if (!versionField || !versionField.options) return null;

              const versionLabel =
                versionField.key === "javaVersion" ? "Java Version" :
                versionField.key === "pythonVersion" ? "Python Version" :
                "Node Version";

              return (
                <FormField label={versionLabel}>
                  <Select
                    value={
                      (data as ServiceNodeData).additionalConfig?.[versionField.key] ||
                      versionField.defaultValue ||
                      versionField.options[0]?.value ||
                      ""
                    }
                    onChange={(e) => {
                      const currentConfig = (data as ServiceNodeData).additionalConfig || {};
                      updateField("additionalConfig", {
                        ...currentConfig,
                        [versionField.key]: e.target.value,
                      });
                    }}
                    options={versionField.options}
                  />
                </FormField>
              );
            })()}

            <FormField label="Port">
              <Input
                value={
                  data.ports?.[0]?.split(":")[0] ||
                  config.defaultPort?.toString() ||
                  ""
                }
                onChange={(e) => {
                  const hostPort = e.target.value;
                  const containerPort = config.defaultPort || 8080;
                  updateField(
                    "ports",
                    hostPort ? [`${hostPort}:${containerPort}`] : []
                  );
                }}
                placeholder={config.defaultPort?.toString() || "8080"}
              />
            </FormField>
          </div>
        </CollapsibleSection>

        {/* Authentication Section (for databases) */}
        {isDatabase && (
          <CollapsibleSection
            title="Authentication"
            isOpen={openSections.auth}
            onToggle={() => toggleSection("auth")}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {/* PostgreSQL Authentication */}
              {serviceType === "postgres" && (
                <>
                  <FormField label="Database Name">
                    <Input
                      value={data.env?.["POSTGRES_DB"] || ""}
                      onChange={(e) => updateEnv("POSTGRES_DB", e.target.value)}
                      placeholder="database"
                    />
                  </FormField>

                  <FormField label="Username">
                    <Input
                      value={data.env?.["POSTGRES_USER"] || ""}
                      onChange={(e) =>
                        updateEnv("POSTGRES_USER", e.target.value)
                      }
                      placeholder="user"
                    />
                  </FormField>

                  <FormField label="Password">
                    <Input
                      type="password"
                      value={data.env?.["POSTGRES_PASSWORD"] || ""}
                      onChange={(e) =>
                        updateEnv("POSTGRES_PASSWORD", e.target.value)
                      }
                      placeholder="password"
                    />
                  </FormField>
                </>
              )}

              {/* MySQL Authentication */}
              {serviceType === "mysql" && (
                <>
                  <FormField label="Database Name">
                    <Input
                      value={data.env?.["MYSQL_DATABASE"] || ""}
                      onChange={(e) =>
                        updateEnv("MYSQL_DATABASE", e.target.value)
                      }
                      placeholder="database"
                    />
                  </FormField>

                  <FormField label="Root Password">
                    <Input
                      type="password"
                      value={data.env?.["MYSQL_ROOT_PASSWORD"] || ""}
                      onChange={(e) =>
                        updateEnv("MYSQL_ROOT_PASSWORD", e.target.value)
                      }
                      placeholder="root password"
                    />
                  </FormField>

                  <FormField label="Username">
                    <Input
                      value={data.env?.["MYSQL_USER"] || ""}
                      onChange={(e) => updateEnv("MYSQL_USER", e.target.value)}
                      placeholder="user"
                    />
                  </FormField>

                  <FormField label="Password">
                    <Input
                      type="password"
                      value={data.env?.["MYSQL_PASSWORD"] || ""}
                      onChange={(e) =>
                        updateEnv("MYSQL_PASSWORD", e.target.value)
                      }
                      placeholder="password"
                    />
                  </FormField>
                </>
              )}

              {/* MongoDB Authentication */}
              {serviceType === "mongodb" && (
                <>
                  <FormField label="Database Name">
                    <Input
                      value={data.env?.["MONGO_INITDB_DATABASE"] || ""}
                      onChange={(e) =>
                        updateEnv("MONGO_INITDB_DATABASE", e.target.value)
                      }
                      placeholder="database"
                    />
                  </FormField>

                  <FormField label="Root Username">
                    <Input
                      value={data.env?.["MONGO_INITDB_ROOT_USERNAME"] || ""}
                      onChange={(e) =>
                        updateEnv("MONGO_INITDB_ROOT_USERNAME", e.target.value)
                      }
                      placeholder="root username"
                    />
                  </FormField>

                  <FormField label="Root Password">
                    <Input
                      type="password"
                      value={data.env?.["MONGO_INITDB_ROOT_PASSWORD"] || ""}
                      onChange={(e) =>
                        updateEnv("MONGO_INITDB_ROOT_PASSWORD", e.target.value)
                      }
                      placeholder="root password"
                    />
                  </FormField>
                </>
              )}

              {/* Redis Authentication */}
              {serviceType === "redis" && (
                <FormField label="Password">
                  <Input
                    type="password"
                    value={data.env?.["REDIS_PASSWORD"] || ""}
                    onChange={(e) =>
                      updateEnv("REDIS_PASSWORD", e.target.value)
                    }
                    placeholder="password (optional)"
                  />
                </FormField>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Build Setting Section (for runtime services) */}
        {!isDatabase && config.buildRequired && (
          <CollapsibleSection
            title="Build Setting"
            isOpen={openSections.build}
            onToggle={() => toggleSection("build")}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <FormField label="Build Path">
                <Input
                  value={(data as ServiceNodeData).build || config.defaultBuildPath || ""}
                  onChange={(e) => updateField("build", e.target.value)}
                  placeholder={config.defaultBuildPath || "./"}
                />
              </FormField>
            </div>
          </CollapsibleSection>
        )}

        {/* Health Check Section (for runtime services) */}
        {!isDatabase && config.defaultHealthCheck && (
          <CollapsibleSection
            title="Health Check"
            isOpen={openSections.health}
            onToggle={() => toggleSection("health")}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {config.defaultHealthCheck.httpGet && (
                <>
                  <FormField label="HTTP Path">
                    <Input
                      value={
                        (data as ServiceNodeData).health?.httpGet?.path ||
                        config.defaultHealthCheck?.httpGet?.path ||
                        "/health"
                      }
                      onChange={(e) => {
                        const currentPort =
                          (data as ServiceNodeData).health?.httpGet?.port ||
                          config.defaultHealthCheck?.httpGet?.port ||
                          8080;
                        updateField("health", {
                          httpGet: { path: e.target.value, port: currentPort },
                        });
                      }}
                      placeholder="/health"
                    />
                  </FormField>

                  <FormField label="Port">
                    <Input
                      type="number"
                      value={
                        (data as ServiceNodeData).health?.httpGet?.port ||
                        config.defaultHealthCheck?.httpGet?.port ||
                        8080
                      }
                      onChange={(e) => {
                        const currentPath =
                          (data as ServiceNodeData).health?.httpGet?.path ||
                          config.defaultHealthCheck?.httpGet?.path ||
                          "/health";
                        updateField("health", {
                          httpGet: { path: currentPath, port: Number(e.target.value) },
                        });
                      }}
                      placeholder="8080"
                    />
                  </FormField>
                </>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Storage Section (for databases) */}
        {isDatabase && config.supportsVolumes && (
          <CollapsibleSection
            title="Storage"
            isOpen={openSections.storage}
            onToggle={() => toggleSection("storage")}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <FormField label="Volume Path">
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Input
                    value={
                      data.volumes?.[0]?.host ||
                      config.defaultVolumes?.[0]?.host ||
                      ""
                    }
                    onChange={(e) => {
                      const currentMount =
                        data.volumes?.[0]?.mount ||
                        config.defaultVolumes?.[0]?.mount ||
                        "";
                      updateField("volumes", [
                        { host: e.target.value, mount: currentMount },
                      ]);
                    }}
                    placeholder="./.arfni/data"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={handleBrowseDirectory}
                    style={{
                      padding: "0.5rem",
                      backgroundColor: "#4F46E5",
                      color: "white",
                      border: "none",
                      borderRadius: "0.375rem",
                      cursor: "pointer",
                      fontSize: "1rem",
                    }}
                  >
                    📁
                  </button>
                </div>
              </FormField>

              <FormField label="Size (GB)">
                <Input
                  type="number"
                  value={(data as any).storageSize || 10}
                  onChange={(e) =>
                    updateField("storageSize", Number(e.target.value))
                  }
                  placeholder="10"
                />
              </FormField>
            </div>
          </CollapsibleSection>
        )}

        {/* Resource Limits Section */}
        {isDatabase && (
          <CollapsibleSection
            title="Resource Limits"
            isOpen={openSections.resources}
            onToggle={() => toggleSection("resources")}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <FormField label="Memory Limit (MB)">
                <Input
                  type="number"
                  value={(data as any).memoryLimit || 512}
                  onChange={(e) =>
                    updateField("memoryLimit", Number(e.target.value))
                  }
                  placeholder="512"
                />
              </FormField>

              <FormField label="CPU Limit">
                <Input
                  type="number"
                  step="0.1"
                  value={(data as any).cpuLimit || 0.5}
                  onChange={(e) =>
                    updateField("cpuLimit", Number(e.target.value))
                  }
                  placeholder="0.5"
                />
              </FormField>
            </div>
          </CollapsibleSection>
        )}

        {/* Environment Variables Section */}
        <CollapsibleSection
          title="Environment Variables"
          isOpen={openSections.env}
          onToggle={() => toggleSection("env")}
        >
          <div
            style={{
              paddingTop: "0.5rem",
            }}
            className="env-editor"
          >
            <KeyValueEditor
              entries={data.env || {}}
              onChange={updateAllEnv}
              keyPlaceholder="KEY"
              valuePlaceholder="Value"
            />
          </div>
        </CollapsibleSection>
      </div>

      {/* Apply Changes Button */}
      <div style={{ paddingTop: "1rem", borderTop: "1px solid #E5E7EB" }}>
        <button
          onClick={handleApplyChanges}
          style={{
            width: "100%",
            padding: "0.75rem",
            backgroundColor: "#4F46E5",
            color: "white",
            border: "none",
            borderRadius: "0.5rem",
            fontSize: "1rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "background-color 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#4338CA";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#4F46E5";
          }}
        >
          Apply Changes
        </button>
      </div>
    </div>
  );
}
