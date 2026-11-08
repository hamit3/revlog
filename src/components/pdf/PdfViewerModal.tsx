import React, { useEffect, useState } from 'react';
import { Alert, Modal, Spin, Typography } from 'antd';
import { useTranslate } from '@refinedev/core';
import { PdfViewer } from './PdfViewer';
import { tokens } from '../../theme/tokens';
import { supabaseClient } from '../../providers/supabaseClient';
import { triggerBlobDownload } from '../../lib/storage';

export interface PdfViewerModalProps {
  open: boolean;
  title?: string;
  fileName?: string | null;
  storagePath?: string | null;
  file?: File | null;
  blob?: Blob | null;
  onClose: () => void;
}

interface PdfModalContentProps {
  title?: string;
  fileName?: string | null;
  storagePath?: string | null;
  file?: File | null;
  blob?: Blob | null;
}

const PdfViewerModalContent: React.FC<PdfModalContentProps> = ({
  title,
  fileName,
  storagePath,
  file,
  blob,
}) => {
  const t = useTranslate();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [downloadBlob, setDownloadBlob] = useState<Blob | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    const loadPdf = async () => {
      try {
        if (file) {
          createdUrl = URL.createObjectURL(file);
          if (active) {
            setBlobUrl(createdUrl);
            setDownloadBlob(file);
            setIsLoading(false);
          }
          return;
        }

        if (blob) {
          createdUrl = URL.createObjectURL(blob);
          if (active) {
            setBlobUrl(createdUrl);
            setDownloadBlob(blob);
            setIsLoading(false);
          }
          return;
        }

        if (storagePath) {
          const { data: fileBlob, error } = await supabaseClient.storage
            .from('project-files')
            .download(storagePath);

          if (error || !fileBlob) {
            throw new Error(error?.message ?? t('pdf.downloadError'));
          }

          // Ensure application/pdf mime type
          const typedBlob = new Blob([fileBlob], { type: 'application/pdf' });
          createdUrl = URL.createObjectURL(typedBlob);

          if (active) {
            setBlobUrl(createdUrl);
            setDownloadBlob(typedBlob);
            setIsLoading(false);
          }
          return;
        }

        throw new Error(t('pdf.noFileSpecified'));
      } catch (err) {
        if (active) {
          setErrorMessage(err instanceof Error ? err.message : t('common.errorPrefix'));
          setIsLoading(false);
        }
      }
    };

    void loadPdf();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [file, blob, storagePath, t]);

  const handleDownload = () => {
    if (downloadBlob) {
      triggerBlobDownload(downloadBlob, fileName || 'document.pdf');
    }
  };

  if (errorMessage) {
    return (
      <div style={{ padding: tokens.spacing.md }}>
        <Alert type="error" showIcon message={errorMessage} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        style={{
          height: '70vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tokens.colors.surfaceSubtle,
        }}
      >
        <Spin tip={t('pdf.loadingDocument')} size="large" />
      </div>
    );
  }

  if (!blobUrl) {
    return null;
  }

  return (
    <PdfViewer
      blobUrl={blobUrl}
      fileName={fileName}
      title={title}
      height="75vh"
      downloadFileName={fileName}
      onDownload={handleDownload}
    />
  );
};

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  open,
  title,
  fileName,
  storagePath,
  file,
  blob,
  onClose,
}) => {
  const t = useTranslate();

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="92vw"
      style={{ maxWidth: 1200, top: 24 }}
      styles={{
        body: {
          padding: 0,
          backgroundColor: tokens.colors.surface,
        },
      }}
      title={
        <Typography.Text strong ellipsis style={{ maxWidth: '85%' }}>
          {title || fileName || t('pdf.documentPreview')}
        </Typography.Text>
      }
      destroyOnHidden
    >
      {open && (
        <PdfViewerModalContent
          title={title}
          fileName={fileName}
          storagePath={storagePath}
          file={file}
          blob={blob}
        />
      )}
    </Modal>
  );
};
