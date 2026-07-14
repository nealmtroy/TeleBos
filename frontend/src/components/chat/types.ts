export interface ChatItem {
  chat_id: number;
  title: string;
  username: string | null;
  chat_type: string;
  last_message: string | null;
  last_message_time: string | null;
  unread_count: number;
  folder_id?: number | null;
  is_archived?: boolean;
  is_pinned?: boolean;
  is_muted?: boolean;
}

export interface FolderItem {
  id: string;
  account_id: string;
  folder_id: number;
  title: string;
  emoji: string | null;
  color: number | null;
  included_chat_ids: number[];
}

export interface MessageItem {
  id: number;
  sender_id: number | null;
  sender_name: string | null;
  text: string | null;
  date: string;
  is_outgoing: boolean;
  reply_to_msg_id: number | null;
  reply_preview: string | null;
  media_type: string | null;
  media_filename: string | null;
  stripped_thumb?: string | null;
  waveform_levels?: number[];
  file_size?: number | null;
  mime_type?: string | null;
  poll?: {
    question: string;
    options: {
      text: string;
      voters: number;
      chosen: boolean;
      correct?: boolean;
    }[];
    total_voters: number;
    closed: boolean;
    is_quiz: boolean;
  } | null;
  is_service?: boolean;
  service_text?: string | null;
}

export type FolderFilter =
  | { type: "all" }
  | { type: "archived" }
  | { type: "folder"; folderId: number; label: string };
