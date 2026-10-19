import { IconLibrary } from '@tabler/icons-react'
import { AttachmentChip } from './attachment-chip'

type TextAttachmentChipProps = {
  label: string
  onRemove?: () => void
}

export function TextAttachmentChip({ label, onRemove }: TextAttachmentChipProps) {
  return <AttachmentChip label={label} icon={IconLibrary} onRemove={onRemove} />
}
