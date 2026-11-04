import { useState } from 'react'
import AdminActionDialog from '../../../components/admin/AdminActionDialog'
import { runAdminAction } from '../../../services/admin/adminBackendApi'

/**
 * One confirmation dialog at a time for live admin actions (AdminActionDialog, real results only).
 * open({ title, message, confirmLabel, tone, reason, doneText, run(reason) => Promise })
 */
export default function useLiveAction() {
  const [config, setConfig] = useState(null)
  return {
    open: setConfig,
    dialog: config && (
      <AdminActionDialog
        key={config.title}
        title={config.title}
        message={config.message}
        confirmLabel={config.confirmLabel}
        tone={config.tone}
        reason={config.reason}
        doneText={config.doneText}
        onConfirm={(reason) => runAdminAction(() => config.run(reason))}
        onClose={() => {
          setConfig(null)
          config.onClose?.()
        }}
      />
    ),
  }
}
