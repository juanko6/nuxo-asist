import { api } from './client';
import type {
  ScheduleTemplateSummary,
  ScheduleTemplateDetail,
  CreateScheduleTemplateDTO,
  EmployeeScheduleView,
  EmployeeSchedule,
  AssignScheduleDTO,
} from '@/types';

export const schedulesService = {
  getTemplates: (): Promise<ScheduleTemplateSummary[]> =>
    api.get<ScheduleTemplateSummary[]>('/schedule-templates'),

  getTemplate: (id: string): Promise<ScheduleTemplateDetail> =>
    api.get<ScheduleTemplateDetail>(`/schedule-templates/${id}`),

  createTemplate: (data: CreateScheduleTemplateDTO): Promise<ScheduleTemplateDetail> =>
    api.post<ScheduleTemplateDetail>('/schedule-templates', data),

  deleteTemplate: (id: string): Promise<void> =>
    api.delete<void>(`/schedule-templates/${id}`),

  getEmployeeSchedule: (employeeId: string): Promise<EmployeeScheduleView> =>
    api.get<EmployeeScheduleView>(`/employees/${employeeId}/schedule`),

  assignSchedule: (employeeId: string, data: AssignScheduleDTO): Promise<EmployeeSchedule> =>
    api.post<EmployeeSchedule>(`/employees/${employeeId}/schedule`, data),
};
