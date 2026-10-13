import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import { SuccessModal } from './SuccessModal';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./CICDSetupModal', () => ({ CICDSetupModal: () => null }));

it('shows the monitoring warning in the first success result', async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(<SuccessModal isOpen onClose={() => {}} duration={1} stats={{ serviceCount: 1, containerCount: 1 }} endpoints={[]} monitoringWarning />);
  });
  expect(view.root.findByProps({ role: 'alert' }).children).toContain('monitoringWarning.title');
  await act(async () => view.unmount());
});
