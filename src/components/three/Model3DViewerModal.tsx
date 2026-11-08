import React from 'react';
import { Modal } from 'antd';
import { useTranslate } from '@refinedev/core';
import { ThreeViewer } from './ThreeViewer';

export interface Model3DViewerModalProps {
  open?: boolean;
  onClose?: () => void;
  inline?: boolean;
  height?: number | string;
  title?: string;
  fileName: string;
  storagePath?: string | null;
  arrayBuffer?: ArrayBuffer | null;
}

export const Model3DViewerModal: React.FC<Model3DViewerModalProps> = ({
  open = true,
  onClose,
  inline = false,
  height = 640,
  title,
  fileName,
  storagePath,
  arrayBuffer,
}) => {
  const t = useTranslate();

  const content = (
    <div style={{ position: 'relative', width: '100%', minHeight: height }}>
      <ThreeViewer
        data={arrayBuffer}
        storagePath={storagePath}
        fileName={fileName}
        height={height}
      />
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1040}
      title={title || fileName || t('viewer3d.title')}
      destroyOnClose
      styles={{ body: { padding: 0 } }}
    >
      {content}
    </Modal>
  );
};
