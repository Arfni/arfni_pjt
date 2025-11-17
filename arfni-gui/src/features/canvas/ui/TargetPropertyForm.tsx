import { useAppDispatch, useAppSelector } from '@app/hooks';
import { updateNode } from '../model/canvasSlice';
import { CustomNode, TargetNodeData } from '../model/types';
import { FormField, Input, Select } from '../../../shared/ui/form';
import { selectCurrentProject } from '@features/project';
import { ec2ServerCommands, projectCommands } from '@shared/api/tauri/commands';
import { useTranslation } from 'react-i18next';

interface TargetPropertyFormProps {
  node: CustomNode;
}

export function TargetPropertyForm({ node }: TargetPropertyFormProps) {
  const dispatch = useAppDispatch();
  const currentProject = useAppSelector(selectCurrentProject);
  const data = node.data as TargetNodeData;
  const { t } = useTranslation('canvas');

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

    // EC2 프로젝트이고 mode 또는 workdir 필드 변경 시 프로젝트 DB에도 업데이트
    if ((field === 'mode' || field === 'workdir') && currentProject?.id) {
      try {
        await projectCommands.updateProject(
          currentProject.id,
          field === 'mode' ? (value as string) : data.mode,
          field === 'workdir' ? (value as string) : data.workdir
        );
      } catch (error) {
        console.error(`❌ 프로젝트 ${field} 업데이트 실패:`, error);
      }
    }
  };

  // Target 타입 확인 (docker-desktop or ec2.ssh)
  const isEC2Target = data.host !== undefined;

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{t('properties.info.targetProperties')}</h3>

      {/* Target Name */}
      <FormField label={t('properties.labels.name')}>
        <Input
          value={data.name || ''}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder={t('properties.placeholders.targetName')}
        />
      </FormField>

      {/* Target Type (읽기 전용) */}
      <FormField label={t('properties.labels.type')}>
        <Input
          value={isEC2Target ? t('properties.targetTypes.ec2') : t('properties.targetTypes.dockerDesktop')}
          disabled
          style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
        />
      </FormField>

      {/* EC2 전용 필드 */}
      {isEC2Target && (
        <>
          {/* Host */}
          <FormField label={t('properties.labels.host')}>
            <Input
              value={data.host || ''}
              onChange={(e) => updateField('host', e.target.value)}
              placeholder={t('properties.placeholders.ec2Host')}
            />
          </FormField>

          {/* User */}
          <FormField label={t('properties.labels.user')}>
            <Input
              value={data.user || ''}
              onChange={(e) => updateField('user', e.target.value)}
              placeholder={t('properties.placeholders.defaultUser')}
            />
          </FormField>

          {/* SSH Key Path */}
          <FormField label={t('properties.labels.sshKey')}>
            <Input
              value={data.sshKey || ''}
              onChange={(e) => updateField('sshKey', e.target.value)}
              placeholder={t('properties.placeholders.sshKeyPath')}
            />
          </FormField>

          {/* Working Directory */}
          <FormField label={t('properties.labels.workingDirectory')}>
            <Input
              value={data.workdir || '/home/ubuntu'}
              onChange={(e) => updateField('workdir', e.target.value)}
              placeholder={t('properties.placeholders.workingDirectory')}
            />
          </FormField>

          {/* Monitoring Mode (EC2만 해당) */}
          <FormField label={t('properties.labels.monitoringMode')}>
            <Select
              value={data.mode || 'no-monitoring'}
              onChange={(e) => updateField('mode', e.target.value)}
            >
              <option value="all-in-one">{t('properties.monitoringModeOptions.allInOne')}</option>
              <option value="hybrid">{t('properties.monitoringModeOptions.hybrid')}</option>
              <option value="no-monitoring">{t('properties.monitoringModeOptions.noMonitoring')}</option>
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
            <strong>{t('properties.info.monitoringModes.title')}</strong>
            <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.5rem' }}>
              <li><strong>All-in-One:</strong> {t('properties.info.monitoringModes.allInOne')}</li>
              <li><strong>Hybrid:</strong> {t('properties.info.monitoringModes.hybrid')}</li>
              <li><strong>No Monitoring:</strong> {t('properties.info.monitoringModes.noMonitoring')}</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
