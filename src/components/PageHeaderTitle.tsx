import React from 'react';
import { Typography } from 'antd';

export interface PageHeaderTitleProps {
  title: string;
  subtitle?: string | null;
  badge?: React.ReactNode;
  headingId?: string;
}

export const PageHeaderTitle: React.FC<PageHeaderTitleProps> = ({
  title,
  subtitle,
  badge,
  headingId,
}) => {
  return (
    <div>
      <div className="revlog-page-title-row">
        <Typography.Title level={1} id={headingId} style={{ margin: 0, textWrap: 'balance' }}>
          {title}
        </Typography.Title>
        {badge}
      </div>
      {subtitle ? (
        <div className="revlog-secondary-text revlog-prose" style={{ marginTop: 2 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
};
