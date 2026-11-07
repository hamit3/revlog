import React, { useEffect } from 'react';
import { useTranslate } from '@refinedev/core';
import { Button, Card, Form, Modal, Radio, Select, Space } from 'antd';
import type { BomColumnMapping, PnpColumnMapping } from '../../types/database';
import { tokens } from '../../theme/tokens';

export interface ColumnMappingModalProps {
  open: boolean;
  onClose: () => void;
  bomHeaders: readonly string[];
  pnpHeaders: readonly string[];
  currentBomMapping: BomColumnMapping | null;
  currentPnpMapping: PnpColumnMapping | null;
  onApply: (bomMapping: BomColumnMapping | null, pnpMapping: PnpColumnMapping | null) => void;
  onResetToAuto: () => void;
}

export const ColumnMappingModal: React.FC<ColumnMappingModalProps> = ({
  open,
  onClose,
  bomHeaders,
  pnpHeaders,
  currentBomMapping,
  currentPnpMapping,
  onApply,
  onResetToAuto,
}) => {
  const t = useTranslate();
  const [bomForm] = Form.useForm();
  const [pnpForm] = Form.useForm();

  useEffect(() => {
    if (open) {
      if (currentBomMapping) {
        bomForm.setFieldsValue({
          designators: currentBomMapping.designators ?? undefined,
          mpn: currentBomMapping.mpn ?? '__none__',
          value: currentBomMapping.value ?? '__none__',
          footprint: currentBomMapping.footprint ?? '__none__',
          quantity: currentBomMapping.quantity ?? '__none__',
          manufacturer: currentBomMapping.manufacturer ?? '__none__',
          dnp: currentBomMapping.dnp ?? '__none__',
          dnpPolarity: currentBomMapping.dnpPolarity ?? 'dnp',
          side: currentBomMapping.side ?? '__none__',
        });
      } else {
        bomForm.resetFields();
      }

      if (currentPnpMapping) {
        pnpForm.setFieldsValue({
          designator: currentPnpMapping.designator ?? undefined,
          value: currentPnpMapping.value ?? '__none__',
          footprint: currentPnpMapping.footprint ?? '__none__',
          x: currentPnpMapping.x ?? '__none__',
          y: currentPnpMapping.y ?? '__none__',
          rotation: currentPnpMapping.rotation ?? '__none__',
          side: currentPnpMapping.side ?? '__none__',
        });
      } else {
        pnpForm.resetFields();
      }
    }
  }, [open, currentBomMapping, currentPnpMapping, bomForm, pnpForm]);

  const handleOk = async () => {
    let nextBom: BomColumnMapping | null = null;
    let nextPnp: PnpColumnMapping | null = null;

    if (bomHeaders.length > 0) {
      const bomVals = await bomForm.validateFields();
      nextBom = {
        designators: bomVals.designators || null,
        mpn: bomVals.mpn === '__none__' ? null : bomVals.mpn || null,
        value: bomVals.value === '__none__' ? null : bomVals.value || null,
        footprint: bomVals.footprint === '__none__' ? null : bomVals.footprint || null,
        quantity: bomVals.quantity === '__none__' ? null : bomVals.quantity || null,
        manufacturer: bomVals.manufacturer === '__none__' ? null : bomVals.manufacturer || null,
        dnp: bomVals.dnp === '__none__' ? null : bomVals.dnp || null,
        dnpPolarity: (bomVals.dnpPolarity as 'dnp' | 'fitted') || 'dnp',
        side: bomVals.side === '__none__' ? null : bomVals.side || null,
      };
    }

    if (pnpHeaders.length > 0) {
      const pnpVals = await pnpForm.validateFields();
      nextPnp = {
        designator: pnpVals.designator || null,
        value: pnpVals.value === '__none__' ? null : pnpVals.value || null,
        footprint: pnpVals.footprint === '__none__' ? null : pnpVals.footprint || null,
        x: pnpVals.x === '__none__' ? null : pnpVals.x || null,
        y: pnpVals.y === '__none__' ? null : pnpVals.y || null,
        rotation: pnpVals.rotation === '__none__' ? null : pnpVals.rotation || null,
        side: pnpVals.side === '__none__' ? null : pnpVals.side || null,
      };
    }

    onApply(nextBom, nextPnp);
    onClose();
  };

  const buildOptions = (headers: readonly string[], required: boolean = false) => {
    const list = headers.map((h) => ({ label: h, value: h }));
    if (!required) {
      return [{ label: t('bomPnp.mapping.selectNone'), value: '__none__' }, ...list];
    }
    return list;
  };

  return (
    <Modal
      open={open}
      title={t('bomPnp.mappingModalTitle')}
      onCancel={onClose}
      width={720}
      footer={[
        <Button key="reset" onClick={onResetToAuto} style={{ float: 'left' }}>
          {t('bomPnp.mapping.reset')}
        </Button>,
        <Button key="cancel" onClick={onClose}>
          {t('bomPnp.mapping.cancel')}
        </Button>,
        <Button key="apply" type="primary" onClick={() => void handleOk()}>
          {t('bomPnp.mapping.apply')}
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing.lg }}>
        {bomHeaders.length > 0 && (
          <Card size="small" title={t('bomPnp.mapping.bomTitle')}>
            <Form form={bomForm} layout="vertical" initialValues={{ dnpPolarity: 'dnp' }}>
              <Form.Item
                name="designators"
                label={t('bomPnp.mapping.designatorsField')}
                rules={[{ required: true, message: t('common.requiredField') }]}
              >
                <Select options={buildOptions(bomHeaders, true)} showSearch />
              </Form.Item>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: tokens.spacing.md,
                }}
              >
                <Form.Item name="value" label={t('bomPnp.mapping.valueField')}>
                  <Select options={buildOptions(bomHeaders)} showSearch />
                </Form.Item>
                <Form.Item name="footprint" label={t('bomPnp.mapping.footprintField')}>
                  <Select options={buildOptions(bomHeaders)} showSearch />
                </Form.Item>
                <Form.Item name="mpn" label={t('bomPnp.mapping.mpnField')}>
                  <Select options={buildOptions(bomHeaders)} showSearch />
                </Form.Item>
                <Form.Item name="manufacturer" label={t('bomPnp.mapping.manufacturerField')}>
                  <Select options={buildOptions(bomHeaders)} showSearch />
                </Form.Item>
                <Form.Item name="quantity" label={t('bomPnp.mapping.quantityField')}>
                  <Select options={buildOptions(bomHeaders)} showSearch />
                </Form.Item>
                <Form.Item name="side" label={t('bomPnp.mapping.sideField')}>
                  <Select options={buildOptions(bomHeaders)} showSearch />
                </Form.Item>
                <Form.Item name="dnp" label={t('bomPnp.mapping.dnpField')}>
                  <Select options={buildOptions(bomHeaders)} showSearch />
                </Form.Item>
              </div>

              <Form.Item name="dnpPolarity" label={t('bomPnp.mapping.dnpPolarityField')}>
                <Radio.Group>
                  <Space direction="vertical">
                    <Radio value="dnp">{t('bomPnp.mapping.dnpPolarityDnp')}</Radio>
                    <Radio value="fitted">{t('bomPnp.mapping.dnpPolarityFitted')}</Radio>
                  </Space>
                </Radio.Group>
              </Form.Item>
            </Form>
          </Card>
        )}

        {pnpHeaders.length > 0 && (
          <Card size="small" title={t('bomPnp.mapping.pnpTitle')}>
            <Form form={pnpForm} layout="vertical">
              <Form.Item
                name="designator"
                label={t('bomPnp.mapping.designatorsField')}
                rules={[{ required: true, message: t('common.requiredField') }]}
              >
                <Select options={buildOptions(pnpHeaders, true)} showSearch />
              </Form.Item>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: tokens.spacing.md,
                }}
              >
                <Form.Item name="value" label={t('bomPnp.mapping.valueField')}>
                  <Select options={buildOptions(pnpHeaders)} showSearch />
                </Form.Item>
                <Form.Item name="footprint" label={t('bomPnp.mapping.footprintField')}>
                  <Select options={buildOptions(pnpHeaders)} showSearch />
                </Form.Item>
                <Form.Item name="x" label={t('bomPnp.mapping.xField')}>
                  <Select options={buildOptions(pnpHeaders)} showSearch />
                </Form.Item>
                <Form.Item name="y" label={t('bomPnp.mapping.yField')}>
                  <Select options={buildOptions(pnpHeaders)} showSearch />
                </Form.Item>
                <Form.Item name="rotation" label={t('bomPnp.mapping.rotationField')}>
                  <Select options={buildOptions(pnpHeaders)} showSearch />
                </Form.Item>
                <Form.Item name="side" label={t('bomPnp.mapping.sideField')}>
                  <Select options={buildOptions(pnpHeaders)} showSearch />
                </Form.Item>
              </div>
            </Form>
          </Card>
        )}
      </div>
    </Modal>
  );
};
