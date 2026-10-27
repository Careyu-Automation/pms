import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { App } from '../App';
import DashboardPage from '../pages/dashboard/DashboardPage';
import TeamDashboardPage from '../pages/team-dashboard/TeamDashboardPage';
import LeadPipelinePage from '../pages/leads/LeadPipelinePage';
import LeadFormPage from '../pages/leads/LeadFormPage';
import LeadDetailPage from '../pages/leads/LeadDetailPage';
import FeasibilityListPage from '../pages/feasibility/FeasibilityListPage';
import FeasibilityDetailPage from '../pages/feasibility/FeasibilityDetailPage';
import FeasibilityLeadGate from '../pages/feasibility/FeasibilityLeadGate';
import SolutionCostingPage from '../pages/feasibility/SolutionCostingPage';
import SolutionCostingDetailPage from '../pages/feasibility/SolutionCostingDetailPage';
import ProjectListPage from '../pages/projects/ProjectListPage';
import ActiveProjectsPage from '../pages/projects/ActiveProjectsPage';
import ProjectDetailPage from '../pages/projects/ProjectDetailPage';
import PlanningPage from '../pages/projects/PlanningPage';
import TaskListPage from '../pages/tasks/TaskListPage';
import MyAssignedWorkPage from '../pages/tasks/MyAssignedWorkPage';
import TaskDetailPage from '../pages/tasks/TaskDetailPage';
import ProductsPage from '../pages/products/ProductsPage';
import MyChecklistPage from '../pages/checklist/MyChecklistPage';
import DailyWorkPage from '../pages/daily-work/DailyWorkPage';
import DailyWorkDetailPage from '../pages/daily-work/DailyWorkDetailPage';
import MyTimePage from '../pages/time/MyTimePage';
import LeavePage from '../pages/leave/LeavePage';
import WorkloadPage from '../pages/workload/WorkloadPage';
import WorkloadDetailPage from '../pages/workload/WorkloadDetailPage';
import MessagesPage from '../pages/messages/MessagesPage';
import ForumThreadPage from '../pages/messages/ForumThreadPage';
import MeetingsPage from '../pages/meetings/MeetingsPage';
import EmailReportsPage from '../pages/email-reports/EmailReportsPage';
import EscalationsPage from '../pages/escalations/EscalationsPage';
import EscalationDetailPage from '../pages/escalations/EscalationDetailPage';
import TeamsPage from '../pages/teams/TeamsPage';
import ProcurementRequestsPage from '../pages/procurement/ProcurementRequestsPage';
import InsightsPage from '../pages/insights/InsightsPage';
import OrganizationPage from '../pages/organization/OrganizationPage';
import UsersPage from '../pages/users/UsersPage';
import TeamDetailPage from '../pages/teams/TeamDetailPage';
import ProductDetailPage from '../pages/products/ProductDetailPage';
import ModulePage from '../pages/modules/ModulePage';
import AdminSettingsPage from '../pages/settings/AdminSettingsPage';
import PersonalSettingsPage from '../pages/settings/PersonalSettingsPage';
import NotFoundPage from '../pages/NotFoundPage';
import { GuestRoute } from './GuestRoute';
import { getModuleRoutes } from './navigation';
import { ProtectedRoute } from './ProtectedRoute';

const MODULE_PAGES = {
  '/dashboard': DashboardPage,
  '/team-dashboard': TeamDashboardPage,
  '/lead-pipeline': LeadPipelinePage,
  '/feasibility-studies': FeasibilityListPage,
  '/solution-costing': SolutionCostingPage,
  '/projects': ProjectListPage,
  '/projects/active': ActiveProjectsPage,
  '/projects/planning': PlanningPage,
  '/tasks': TaskListPage,
  '/team-tasks': TaskListPage,
  '/my-assigned-work': MyAssignedWorkPage,
  '/products': ProductsPage,
  '/teams': TeamsPage,
  '/procurement-requests': ProcurementRequestsPage,
  '/insights': InsightsPage,
  '/organization': OrganizationPage,
  '/users': UsersPage,
  '/admin-settings': AdminSettingsPage,
  '/settings': PersonalSettingsPage,
  '/meetings': MeetingsPage,
  '/email-reports': EmailReportsPage,
  '/escalations': EscalationsPage,
  '/my-checklist': MyChecklistPage,
};

const NOT_FOUND_HANDLE = {
  title: 'Page not found',
  description: 'This address is not part of the CareYu workspace.',
  crumbs: [{ label: 'Workspace' }, { label: 'Not found' }],
};

export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      {
        element: <GuestRoute />,
        children: [
          {
            path: '/login',
            lazy: () => import('../pages/auth/LoginPage').then((module) => ({ Component: module.default })),
          },
          {
            path: '/signup',
            lazy: () => import('../pages/auth/SignupPage').then((module) => ({ Component: module.default })),
          },
          {
            path: '/reset-password',
            lazy: () => import('../pages/auth/ResetPasswordPage').then((module) => ({ Component: module.default })),
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: '/change-password',
            lazy: () => import('../pages/auth/ChangePasswordPage').then((module) => ({ Component: module.default })),
          },
          {
            element: <AppShell />,
            children: [
              { index: true, element: <Navigate to="/dashboard" replace /> },
              { path: '/my-checklist', element: <MyChecklistPage />, handle: {
                title: 'My Checklist',
                description: 'Personal preparation lists. These are not tasks.',
                icon: 'ListChecks',
                crumbs: [{ label: 'My Work' }, { label: 'My Checklist' }],
              } },
              { path: '/daily-work-updates', element: <DailyWorkPage />, handle: {
                title: 'Daily Work Updates',
                description: 'Daily progress updates',
                icon: 'CalendarCheck',
                crumbs: [{ label: 'My Work' }, { label: 'Daily Work Updates' }],
              } },
              { path: '/leave-permissions', element: <Navigate to="/leave" replace /> },
              { path: '/leave', element: <LeavePage />, handle: {
                title: 'Leave & Permission',
                description: 'Manage leave requests, permissions, approvals and leave history.',
                icon: 'CalendarDays',
                crumbs: [{ label: 'My Work' }, { label: 'Leave & Permission' }],
              } },
              { path: '/workload/employee/:employeeId', element: <WorkloadDetailPage />, handle: {
                title: 'Employee workload',
                description: 'Capacity, tasks, attendance and timesheet for one person.',
                crumbs: [{ label: 'Workload', path: '/workload' }, { label: 'Employee' }],
              } },
              { path: '/messages/forum/:threadId', element: <ForumThreadPage />, handle: {
                title: 'Forum thread',
                description: 'A discussion, question, or idea.',
                crumbs: [{ label: 'Messages', path: '/messages?mode=forum' }, { label: 'Thread' }],
              } },
              { path: '/messages', element: <MessagesPage />, handle: {
                title: 'Messages',
                description: 'Connect with teammates through direct messages, groups, discussions and live chat.',
                icon: 'MessageSquare',
                crumbs: [{ label: 'Communication' }, { label: 'Messages' }],
              } },
              { path: '/workload', element: <WorkloadPage />, handle: {
                title: 'Workload',
                description: 'Capacity, workload and utilization across your teams.',
                icon: 'ChartNoAxesColumn',
                crumbs: [{ label: 'My Work' }, { label: 'Workload' }],
              } },
              { path: '/my-time', element: <MyTimePage />, handle: {
                title: 'My Time',
                description: 'Attendance, time tracking, and the end-of-day report.',
                icon: 'Clock',
                crumbs: [{ label: 'My Work' }, { label: 'My Time' }],
              } },
              { path: '/daily-work-updates/:workItemId', element: <DailyWorkDetailPage />, handle: {
                title: 'Daily Work Update',
                description: 'Daily progress history for a work item.',
                crumbs: [{ label: 'Daily Work Updates', path: '/daily-work-updates' }, { label: 'Update' }],
              } },
              ...getModuleRoutes().filter((module) => !['/my-checklist', '/daily-work-updates', '/my-time', '/leave', '/leave-permissions', '/workload', '/messages'].includes(module.path)).map((module) => {
                const Page = MODULE_PAGES[module.path] || ModulePage;
                return {
                  path: module.path,
                  element: <Page />,
                  handle: module,
                };
              }),
              { path: '/lead-pipeline/create', element: <LeadFormPage mode="create" />, handle: {
                title: 'Create Lead',
                description: 'Capture a sales lead and save it as a draft or submit it to the project manager.',
                crumbs: [{ label: 'Lead Pipeline', path: '/lead-pipeline' }, { label: 'Create' }],
              } },
              { path: '/lead-pipeline/:leadId/edit', element: <LeadFormPage mode="edit" />, handle: {
                title: 'Edit Lead',
                description: 'Update a draft or a lead that the project manager sent back.',
                crumbs: [{ label: 'Lead Pipeline', path: '/lead-pipeline' }, { label: 'Edit' }],
              } },
              { path: '/feasibility-studies/lead/:leadId', element: <FeasibilityLeadGate />, handle: {
                title: 'Feasibility Study',
                description: 'Open the feasibility study linked to this lead.',
                crumbs: [{ label: 'Feasibility Studies', path: '/feasibility-studies' }, { label: 'Study' }],
              } },
              { path: '/feasibility-studies/:studyId', element: <FeasibilityDetailPage />, handle: {
                title: 'Feasibility Study',
                description: 'Engineering feasibility between the lead and solution costing.',
                crumbs: [{ label: 'Feasibility Studies', path: '/feasibility-studies' }, { label: 'Study' }],
              } },
              { path: '/solution-costing/:costingId', element: <SolutionCostingDetailPage />, handle: {
                title: 'Solution & Costing',
                description: 'Develop, calculate and review solution costs for feasible opportunities.',
                crumbs: [{ label: 'Solution & Costing', path: '/solution-costing' }, { label: 'Record' }],
              } },
              { path: '/escalations/:escalationId', element: <EscalationDetailPage />, handle: {
                title: 'Escalation',
                description: 'Issue, impact, resolution, and activity.',
                crumbs: [{ label: 'Escalations', path: '/escalations' }, { label: 'Escalation' }],
              } },
              { path: '/teams/:teamId', element: <TeamDetailPage />, handle: {
                title: 'Team',
                description: 'Team members, projects, and workload.',
                crumbs: [{ label: 'Teams', path: '/teams' }, { label: 'Team' }],
              } },
              { path: '/products/:productId', element: <ProductDetailPage />, handle: {
                title: 'Product',
                description: 'Internal product development work.',
                crumbs: [{ label: 'Products', path: '/products' }, { label: 'Product' }],
              } },
              { path: '/projects/:projectId', element: <ProjectDetailPage />, handle: {
                title: 'Project',
                description: 'Project created from an approved solution costing.',
                crumbs: [{ label: 'Projects', path: '/projects' }, { label: 'Project' }],
              } },
              { path: '/tasks/:taskId', element: <TaskDetailPage />, handle: {
                title: 'Task',
                description: 'Task scheduled on a project plan.',
                crumbs: [{ label: 'Tasks', path: '/tasks' }, { label: 'Task' }],
              } },
              { path: '/lead-pipeline/:leadId', element: <LeadDetailPage />, handle: {
                title: 'Lead Details',
                description: 'Review the project manager summary and the full lead record.',
                crumbs: [{ label: 'Lead Pipeline', path: '/lead-pipeline' }, { label: 'Details' }],
              } },
              { path: '*', element: <NotFoundPage />, handle: NOT_FOUND_HANDLE },
            ],
          },
        ],
      },
    ],
  },
], {
  future: {
    v7_relativeSplatPath: true,
  },
});
