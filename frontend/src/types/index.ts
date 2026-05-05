/** Tipos compartilhados do Open Clinic AI Frontend */

export type UserRole = "admin" | "secretary" | "doctor";

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  doctor_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export type LeadStatus =
  | "novo"
  | "em_contato"
  | "qualificado"
  | "orcamento_enviado"
  | "negociando"
  | "convertido"
  | "perdido";

export type LeadChannel =
  | "telegram"
  | "whatsapp"
  | "google_ads"
  | "meta_ads"
  | "instagram"
  | "site"
  | "indicacao"
  | "outro";

export interface AssignedUserSummary {
  id: string;
  username: string;
  full_name: string;
}

// --- Lead AI Agent ---

export interface LeadAgentConfig {
  status: string;
  is_active: boolean;
  system_prompt: string | null;
  auto_send_on_enter: boolean;
  initial_message: string | null;
  inactivity_hours: number;
  max_inactivity_followups: number;
  inactivity_followup_message: string | null;
  auto_lost_after_hours: number;
  convert_on_appointment: boolean;
}

export interface LeadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sent_at: string;
}

export interface SupervisorQuery {
  id: string;
  question: string;
  context_summary: string | null;
  answer: string | null;
  status: "pending" | "answered" | "timeout";
  asked_at: string;
  answered_at: string | null;
}

export interface LeadConversation {
  id: string;
  lead_id: string;
  channel: string;
  channel_chat_id: string;
  control: "ai" | "awaiting_supervisor" | "human";
  status: "active" | "closed";
  inactivity_followups_sent: number;
  last_message_at: string | null;
  started_at: string;
  messages: LeadMessage[];
  supervisor_queries: SupervisorQuery[];
}

export interface PricingItem {
  specialty: string;
  service: string;
  price: number;
  notes?: string;
}

export interface LeadOutboundMessage {
  id: string;
  lead_id: string;
  channel: string;
  message: string;
  scheduled_for: string | null;
  status: "pending" | "sent" | "failed" | "cancelled";
  sent_at: string | null;
  error: string | null;
  created_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  created_by: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  status: "pending" | "done" | "cancelled";
  completed_at: string | null;
  created_at: string;
}

export interface SupervisorConfig {
  supervisor_whatsapp: string;
  awaiting_message: string;
  timeout_hours: number;
  on_timeout: "escalate_human" | "close_ai";
}

export interface LeadAIGlobalConfig {
  convert_on_appointment: boolean;
}

export interface Lead {
  id: string;
  code: string;
  ai_active: boolean | null;
  full_name: string | null;
  phone: string;
  email: string | null;
  channel: LeadChannel;
  utm_source: string | null;
  utm_campaign: string | null;
  specialty_id: string | null;
  description: string | null;
  quote_value: number | null;
  status: LeadStatus;
  lost_reason: string | null;
  assigned_to: string | null;
  assigned_user: AssignedUserSummary | null;
  sla_deadline: string;
  contacted_at: string | null;
  is_overdue: boolean;
  next_followup_at: string | null;
  converted_patient_id: string | null;
  converted_at: string | null;
  appointment_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineConfig {
  statuses: LeadStatus[];
  pipeline_order: LeadStatus[];
  terminal_statuses: LeadStatus[];
  allowed_transitions: Record<LeadStatus, LeadStatus[]>;
  lost_reasons: { value: string; label: string }[];
  status_labels: Record<LeadStatus, string>;
}

export interface PipelineStageMetric {
  status: LeadStatus;
  total: number;
  value_total: number;
  value_avg: number;
}

export interface LeadInteraction {
  id: string;
  lead_id: string;
  user_id: string;
  type: "nota" | "ligacao" | "whatsapp" | "email" | "reuniao" | "outro";
  content: string;
  next_action: string | null;
  interacted_at: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  specialty_id: string | null;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
  source: "ai_chat" | "secretary" | "patient_link" | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Doctor {
  id: string;
  full_name: string;
  crm: string | null;
  specialty_id: string | null;
  scheduling_provider: "google_calendar" | "local_db";
  slot_duration_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Patient {
  id: string;
  full_name: string | null;
  phone: string;
  email: string | null;
  channel: string;
  channel_id: string | null;
  crm_status: string;
  lead_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Specialty {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

// Tipos de relatório
export interface FunnelItem {
  status: LeadStatus;
  total: number;
}

export interface LeadsBySource {
  channel: LeadChannel;
  utm_campaign: string | null;
  total_leads: number;
  converted: number;
  conversion_rate: number;
}

export interface SLAReport {
  total: number;
  within_sla: number;
  overdue: number;
  sla_rate: number;
}
