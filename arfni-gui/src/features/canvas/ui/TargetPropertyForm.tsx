import { useAppDispatch, useAppSelector } from '@app/hooks';
import { updateNode } from '../model/canvasSlice';
import { CustomNode, TargetNodeData } from '../model/types';
import { FormField, Input, Select } from '../../../shared/ui/form';
import { selectCurrentProject } from '@features/project';
import { ec2ServerCommands, projectCommands } from '@shared/api/tauri/commands';

interface TargetPropertyFormProps {
  node: CustomNode;
}

export function TargetPropertyForm({ node }: TargetPropertyFormProps) {
  const dispatch = useAppDispatch();
  const currentProject = useAppSelector(selectCurrentProject);
  const data = node.data as TargetNodeData;

  // 노드 데이터 업데이트 헬퍼
  const updateField = async (field: string, value: any) => {
    // Redux 상태 업데이트
    dispatch(updateNode({
      id: node.id,
      data: {
        ...data,
        [field]: value
      }
    }));

    // EC2 프로젝트이고 mode 필드 변경 시 프로젝트 DB에도 업데이트
    if (field === 'mode' && currentProject?.id) {
      try {
        await projectCommands.updateProject(
          currentProject.id,
          value as string,
          undefined // workdir는 변경하지 않음
        );
      } catch (error) {
        console.error('❌ 프로젝트 모니터링 모드 업데이트 실패:', error);
      }
    }
  };

  // Target 타입 확인 (docker-desktop or ec2.ssh)
  const isEC2Target = data.host !== undefined;

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Target Properties</h3>

      {/* Target Name */}
      <FormField label="Name">
        <Input
          value={data.name || ''}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="Target name"
        />
      </FormField>

      {/* Target Type (읽기 전용) */}
      <FormField label="Type">
        <Input
          value={isEC2Target ? 'EC2 (SSH)' : 'Docker Desktop'}
          disabled
          style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
        />
      </FormField>

      {/* EC2 전용 필드 */}
      {isEC2Target && (
        <>
          {/* Host */}
          <FormField label="Host">
            <Input
              value={data.host || ''}
              onChange={(e) => updateField('host', e.target.value)}
              placeholder="ec2-host.amazonaws.com"
            />
          </FormField>

          {/* User */}
          <FormField label="User">
            <Input
              value={data.user || ''}
              onChange={(e) => updateField('user', e.target.value)}
              placeholder="ubuntu"
            />
          </FormField>

          {/* SSH Key Path */}
          <FormField label="SSH Key">
            <Input
              value={data.sshKey || ''}
              onChange={(e) => updateField('sshKey', e.target.value)}
              placeholder="/path/to/key.pem"
            />
          </FormField>

          {/* Working Directory */}
          <FormField label="Working Directory">
            <Input
              value={data.workdir || '/home/ubuntu'}
              onChange={(e) => updateField('workdir', e.target.value)}
              placeholder="/home/ubuntu"
            />
          </FormField>

          {/* Monitoring Mode (EC2만 해당) */}
          <FormField label="Monitoring Mode">
            <Select
              value={data.mode || 'all-in-one'}
              onChange={(e) => updateField('mode', e.target.value)}
            >
              <option value="all-in-one">All-in-One (Single Container)</option>
              <option value="hybrid">Hybrid (Separate Containers)</option>
              <option value="no-monitoring">No Monitoring</option>
            </Select>
          </FormField>

          {/* Mode 설명 */}
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#eff6ff',
            borderLeft: '4px solid #3b82f6',
            borderRadius: '4px',
            fontSize: '0.875rem',
            color: '#1e40af'
          }}>
            <strong>Monitoring Modes:</strong>
            <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.5rem' }}>
              <li><strong>All-in-One:</strong> Prometheus, Grafana, Loki in one container</li>
              <li><strong>Hybrid:</strong> Each service in separate containers</li>
              <li><strong>No Monitoring:</strong> Deploy services only, no monitoring stack</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
