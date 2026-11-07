import React from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { Authenticated, Refine } from '@refinedev/core';
import routerProvider, { CatchAllNavigate, UnsavedChangesNotifier } from '@refinedev/react-router';
import { useNotificationProvider } from '@refinedev/antd';
import { App as AntdApp, ConfigProvider } from 'antd';
import {
  AppstoreOutlined,
  BlockOutlined,
  DeploymentUnitOutlined,
  FolderOpenOutlined,
  TagsOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { antdTheme } from './theme/tokens';
import { authProvider } from './providers/authProvider';
import { dataProvider } from './providers/dataProvider';
import { accessControlProvider } from './providers/accessControlProvider';
import { i18nProvider } from './providers/i18nProvider';
import { AppLayout } from './components/AppLayout';
import { AuthPage } from './pages/auth/AuthPage';
import { ProjectsListPage } from './pages/projects/list';
import { CreateProjectPage } from './pages/projects/create';
import { ProjectShowPage } from './pages/projects/show';
import { ProjectSettingsPage } from './pages/projects/settings';
import { CreateProductPage } from './pages/products/create';
import { ProductShowPage } from './pages/products/show';
import { ProductSettingsPage } from './pages/products/settings';
import { ProjectReleaseListPage } from './pages/project-releases/list';
import { ProjectReleaseWizardPage } from './pages/project-releases/wizard';
import { ProjectReleaseShowPage } from './pages/project-releases/show';
import { ReleaseWizardPage } from './pages/releases/wizard';
import { ReleaseListPage } from './pages/releases/list';
import { ReleaseShowPage } from './pages/releases/show';
import { BomPnpPage } from './pages/bom-pnp/BomPnpPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ConfigProvider theme={antdTheme}>
        <AntdApp>
          <Refine
            routerProvider={routerProvider}
            dataProvider={dataProvider}
            authProvider={authProvider}
            accessControlProvider={accessControlProvider}
            i18nProvider={i18nProvider}
            notificationProvider={useNotificationProvider}
            resources={[
              {
                name: 'projects',
                list: '/projects',
                create: '/projects/new',
                show: '/projects/:projectId',
                edit: '/projects/:projectId/settings',
                meta: {
                  label: 'Projects',
                  icon: <AppstoreOutlined aria-hidden="true" />,
                },
              },
              {
                name: 'products',
                create: '/projects/:projectId/products/new',
                show: '/projects/:projectId/products/:productId',
                edit: '/projects/:projectId/products/:productId/settings',
                meta: {
                  parent: 'projects',
                  hide: true,
                  icon: <BlockOutlined aria-hidden="true" />,
                },
              },
              {
                name: 'project_releases',
                list: '/projects/:projectId/releases',
                create: '/projects/:projectId/releases/new',
                edit: '/projects/:projectId/releases/:projectReleaseId/edit',
                show: '/projects/:projectId/releases/:projectReleaseId',
                meta: {
                  parent: 'projects',
                  hide: true,
                  icon: <DeploymentUnitOutlined aria-hidden="true" />,
                },
              },
              {
                name: 'releases',
                list: '/projects/:projectId/products/:productId/releases',
                create: '/projects/:projectId/products/:productId/releases/new',
                edit: '/projects/:projectId/products/:productId/releases/:releaseId/edit',
                show: '/projects/:projectId/products/:productId/releases/:releaseId',
                meta: {
                  parent: 'products',
                  hide: true,
                  icon: <DeploymentUnitOutlined aria-hidden="true" />,
                },
              },
              {
                name: 'categories',
                meta: {
                  parent: 'products',
                  hide: true,
                  icon: <TagsOutlined aria-hidden="true" />,
                },
              },
              {
                name: 'items',
                meta: {
                  parent: 'products',
                  hide: true,
                  icon: <FolderOpenOutlined aria-hidden="true" />,
                },
              },
              {
                name: 'project_members',
                meta: {
                  parent: 'projects',
                  hide: true,
                  icon: <TeamOutlined aria-hidden="true" />,
                },
              },
            ]}
            options={{
              syncWithLocation: false,
              warnWhenUnsavedChanges: true,
              disableTelemetry: true,
            }}
          >
            <Routes>
              <Route
                element={
                  <Authenticated key="auth-pages" fallback={<Outlet />}>
                    <Navigate to="/projects" replace />
                  </Authenticated>
                }
              >
                <Route path="/login" element={<AuthPage key="login" mode="login" />} />
                <Route path="/register" element={<AuthPage key="register" mode="register" />} />
              </Route>

              <Route
                element={
                  <Authenticated key="protected-routes" fallback={<CatchAllNavigate to="/login" />}>
                    <AppLayout />
                  </Authenticated>
                }
              >
                <Route index element={<Navigate to="/projects" replace />} />
                <Route path="/projects" element={<ProjectsListPage />} />
                <Route path="/projects/new" element={<CreateProjectPage />} />
                <Route path="/projects/:projectId" element={<ProjectShowPage />} />
                <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
                <Route path="/projects/:projectId/bom-pnp" element={<BomPnpPage />} />

                {/* Project-level (system) releases */}
                <Route path="/projects/:projectId/releases" element={<ProjectReleaseListPage />} />
                <Route
                  path="/projects/:projectId/releases/new"
                  element={<ProjectReleaseWizardPage />}
                />
                <Route
                  path="/projects/:projectId/releases/:projectReleaseId/edit"
                  element={<ProjectReleaseWizardPage />}
                />
                <Route
                  path="/projects/:projectId/releases/:projectReleaseId"
                  element={<ProjectReleaseShowPage />}
                />

                {/* Products & Product-level releases */}
                <Route path="/projects/:projectId/products/new" element={<CreateProductPage />} />
                <Route
                  path="/projects/:projectId/products/:productId"
                  element={<ProductShowPage />}
                />
                <Route
                  path="/projects/:projectId/products/:productId/settings"
                  element={<ProductSettingsPage />}
                />
                <Route
                  path="/projects/:projectId/products/:productId/bom-pnp"
                  element={<BomPnpPage />}
                />
                <Route
                  path="/projects/:projectId/products/:productId/releases"
                  element={<ReleaseListPage />}
                />
                <Route
                  path="/projects/:projectId/products/:productId/releases/new"
                  element={<ReleaseWizardPage />}
                />
                <Route
                  path="/projects/:projectId/products/:productId/releases/:releaseId/edit"
                  element={<ReleaseWizardPage />}
                />
                <Route
                  path="/projects/:projectId/products/:productId/releases/:releaseId"
                  element={<ReleaseShowPage />}
                />

                <Route path="*" element={<Navigate to="/projects" replace />} />
              </Route>
            </Routes>
            <UnsavedChangesNotifier />
          </Refine>
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  );
};

export default App;
