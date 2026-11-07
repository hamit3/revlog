import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useLogin, useRegister, useTranslate } from '@refinedev/core';
import { Alert, Button, Card, Form, Input, Segmented, Typography } from 'antd';
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  HddOutlined,
  LockOutlined,
  MailOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { appEnv } from '../../lib/env';
import type { LoginParams, RegisterParams } from '../../providers/authProvider';

export interface AuthPageProps {
  mode: 'login' | 'register';
}

interface AuthFormValues {
  fullName?: string;
  email: string;
  password: string;
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode }) => {
  const t = useTranslate();
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm<AuthFormValues>();
  const { mutateAsync: login, isPending: isLoginPending } = useLogin<LoginParams>();
  const { mutateAsync: register, isPending: isRegisterPending } = useRegister<RegisterParams>();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const locationNotice =
    typeof (location.state as { notice?: unknown } | null)?.notice === 'string'
      ? ((location.state as { notice: string }).notice ?? null)
      : null;

  const isRegister = mode === 'register';
  const isSubmitting = isLoginPending || isRegisterPending;

  useEffect(() => {
    const pageTitle = isRegister ? t('auth.signUpTitle') : t('auth.signInTitle');
    document.title = `${pageTitle} | ${t('app.name')}`;
  }, [isRegister, t]);

  const handleFinish = async (values: AuthFormValues) => {
    setErrorMessage(null);

    if (isRegister) {
      const response = await register({
        email: values.email,
        password: values.password,
        fullName: values.fullName ?? '',
      });
      if (!response.success) {
        setErrorMessage(response.error?.message ?? t('auth.invalidCredentials'));
        return;
      }
      if (response.redirectTo === '/projects') {
        navigate('/projects');
      } else {
        navigate('/login', { state: { notice: t('auth.signUpCheckEmail') } });
      }
      return;
    }

    const response = await login({
      email: values.email,
      password: values.password,
    });
    if (!response.success) {
      setErrorMessage(response.error?.message ?? t('auth.invalidCredentials'));
      return;
    }
    navigate(response.redirectTo ?? '/projects');
  };

  return (
    <main
      id="main-content"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: tokens.spacing.xl,
        backgroundColor: tokens.colors.background,
      }}
    >
      <div style={{ width: '100%', maxWidth: tokens.layout.authCardWidth }}>
        <div style={{ marginBottom: tokens.spacing.lg, textAlign: 'center' }}>
          <div
            className="revlog-auth-logo-icon"
            style={{
              width: 38,
              height: 38,
              borderRadius: tokens.radius.md,
              backgroundColor: tokens.colors.accent,
              color: tokens.colors.white,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: tokens.spacing.xs,
              boxShadow: tokens.colors.cardShadow,
            }}
          >
            <HddOutlined aria-hidden="true" />
          </div>
          <div className="revlog-auth-brand">{t('app.name')}</div>
          <div className="revlog-secondary-text">{t('app.subtitle')}</div>
        </div>

        {!appEnv.isConfigured && (
          <Alert
            type="warning"
            showIcon
            message={t('app.missingEnvTitle')}
            description={t('app.missingEnvDescription')}
            style={{ marginBottom: tokens.spacing.lg }}
          />
        )}

        <Card style={{ boxShadow: tokens.colors.elevatedShadow }}>
          <Segmented<'login' | 'register'>
            block
            value={mode}
            onChange={(nextMode) => navigate(nextMode === 'register' ? '/register' : '/login')}
            options={[
              { value: 'login', label: t('auth.modeSignIn') },
              { value: 'register', label: t('auth.modeSignUp') },
            ]}
            style={{ marginBottom: tokens.spacing.lg }}
          />

          <Typography.Title
            level={1}
            style={{
              marginBottom: tokens.spacing.xs,
              textWrap: 'balance',
            }}
          >
            {isRegister ? t('auth.signUpTitle') : t('auth.signInTitle')}
          </Typography.Title>

          <Typography.Paragraph
            type="secondary"
            className="revlog-prose"
            style={{
              marginBottom: tokens.spacing.lg,
            }}
          >
            {isRegister ? t('auth.formSubtitleSignUp') : t('auth.formSubtitleSignIn')}
          </Typography.Paragraph>

          {errorMessage && (
            <div role="alert" style={{ marginBottom: tokens.spacing.lg }}>
              <Alert type="error" showIcon message={errorMessage} />
            </div>
          )}

          {locationNotice && !errorMessage && (
            <div role="status" aria-live="polite" style={{ marginBottom: tokens.spacing.lg }}>
              <Alert type="info" showIcon message={locationNotice} />
            </div>
          )}

          <Form<AuthFormValues>
            form={form}
            layout="vertical"
            requiredMark={false}
            validateTrigger="onBlur"
            onValuesChange={() => {
              if (errorMessage) {
                setErrorMessage(null);
              }
            }}
            onFinish={handleFinish}
          >
            {isRegister && (
              <Form.Item
                label={t('auth.fullNameLabel')}
                name="fullName"
                htmlFor="auth-full-name"
                rules={[{ required: true, whitespace: true, message: t('auth.fullNameRequired') }]}
              >
                <Input
                  id="auth-full-name"
                  name="name"
                  prefix={
                    <UserOutlined
                      aria-hidden="true"
                      style={{ color: tokens.colors.textSecondary }}
                    />
                  }
                  autoComplete="name"
                  placeholder={t('auth.fullNamePlaceholder')}
                  enterKeyHint="next"
                />
              </Form.Item>
            )}

            <Form.Item
              label={t('auth.emailLabel')}
              name="email"
              htmlFor="auth-email"
              rules={[
                { required: true, message: t('auth.emailRequired') },
                { type: 'email', message: t('auth.emailRequired') },
              ]}
            >
              <Input
                id="auth-email"
                name="email"
                type="email"
                prefix={
                  <MailOutlined aria-hidden="true" style={{ color: tokens.colors.textSecondary }} />
                }
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={t('auth.emailPlaceholder')}
                enterKeyHint="next"
              />
            </Form.Item>

            <Form.Item
              label={
                <span>
                  {t('auth.passwordLabel')}
                  {isRegister && (
                    <span
                      id="auth-password-hint"
                      className="revlog-secondary-text"
                      style={{
                        display: 'block',
                        fontWeight: 400,
                      }}
                    >
                      {t('auth.passwordHint')}
                    </span>
                  )}
                </span>
              }
              name="password"
              htmlFor="auth-password"
              rules={[
                { required: true, message: t('auth.passwordRequired') },
                ...(isRegister ? [{ min: 8, message: t('auth.passwordMinLength') }] : []),
              ]}
            >
              <Input.Password
                id="auth-password"
                name={isRegister ? 'new-password' : 'current-password'}
                prefix={
                  <LockOutlined aria-hidden="true" style={{ color: tokens.colors.textSecondary }} />
                }
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                aria-describedby={isRegister ? 'auth-password-hint' : undefined}
                enterKeyHint="done"
                iconRender={(visible) =>
                  visible ? (
                    <EyeOutlined aria-label={t('auth.hidePasswordLabel')} />
                  ) : (
                    <EyeInvisibleOutlined aria-label={t('auth.showPasswordLabel')} />
                  )
                }
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: tokens.spacing.md }}>
              <Button type="primary" htmlType="submit" block loading={isSubmitting}>
                {isRegister ? t('auth.signUpButton') : t('auth.signInButton')}
              </Button>
            </Form.Item>
          </Form>

          <div
            className="revlog-secondary-text"
            style={{
              textAlign: 'center',
              borderTop: `1px solid ${tokens.colors.borderSubtle}`,
              paddingTop: tokens.spacing.md,
            }}
          >
            {isRegister ? (
              <>
                {t('auth.haveAccountPrompt')} <Link to="/login">{t('auth.haveAccountLink')}</Link>
              </>
            ) : (
              <>
                {t('auth.noAccountPrompt')} <Link to="/register">{t('auth.noAccountLink')}</Link>
              </>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
};
