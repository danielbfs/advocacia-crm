export interface MessagingConversation {
  id: string;
  patient_id: string | null;
  lead_id: string | null;
  channel: 'telegram' | 'whatsapp';
  control: 'ai' | 'human';
  status: string;
  started_at: string;
  closed_at: string | null;
  context_summary: string | null;
}

export interface SendHumanMessageRequest {
  text: string;
  channel: string;
  chat_id: string;
}

export interface ToggleControlRequest {
  control: 'ai' | 'human';
}
